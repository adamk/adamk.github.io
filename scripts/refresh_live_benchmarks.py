#!/usr/bin/env python3
"""Refresh public market benchmarks; read-only GETs, no account/P&L writes.

Runs after the existing live index publisher. Credentials stay server-side.
Offline source inputs are supported for exact reproduction and tests.
"""
import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
TREASURY_URL = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml'
ET_ZONE = ZoneInfo('America/New_York')


def parse_treasury(raw):
    root = ET.fromstring(raw)
    result = []
    for entry in root.iter('{http://www.w3.org/2005/Atom}entry'):
        fields = {node.tag.rsplit('}', 1)[-1]:node.text for node in entry.iter()}
        if not fields.get('NEW_DATE') or not fields.get('BC_3MONTH'):
            continue  # missing observations are not invented
        day = date.fromisoformat(fields['NEW_DATE'][:10]).isoformat()
        rate = float(fields['BC_3MONTH'])
        if not -5 <= rate <= 30:
            raise ValueError('Treasury annual-percent yield outside validated range')
        result.append({'date':day,'annual_yield_pct':rate})
    if not result or len({r['date'] for r in result}) != len(result):
        raise ValueError('Treasury observations missing or duplicated')
    return sorted(result,key=lambda row:row['date'])


def get(url, headers=None):
    with urlopen(Request(url,headers=headers or {'User-Agent':'Foxchase-public-benchmark/1.0'}),timeout=40) as response:
        return response.read()


def get_json(url, headers):
    return json.loads(get(url,headers))


def load_env(path):
    if path is None:
        return
    for raw in Path(path).read_text().splitlines():
        line=raw.strip()
        if line.startswith('export '): line=line[7:]
        if not line or line.startswith('#') or '=' not in line: continue
        key,value=line.split('=',1)
        # Existing market-data credentials only; never print them.
        if key.strip() in {'APCA_API_KEY_ID','APCA_API_SECRET_KEY','ALPACA_API_KEY','ALPACA_SECRET_KEY','ALPACA_API_SECRET'}:
            os.environ.setdefault(key.strip(),value.strip().strip('\"').strip("'"))


def fetch_spy(start, end, as_of):
    key=os.getenv('APCA_API_KEY_ID') or os.getenv('ALPACA_API_KEY')
    secret=os.getenv('APCA_API_SECRET_KEY') or os.getenv('ALPACA_API_SECRET') or os.getenv('ALPACA_SECRET_KEY')
    if not key or not secret: raise ValueError('Existing Alpaca market-data credentials unavailable')
    headers={'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret,'Accept':'application/json'}
    sessions=get_json('https://api.alpaca.markets/v2/calendar?'+urlencode({'start':start,'end':end}),headers)
    def bars(timeframe, first, last):
        rows=[]; token=None
        while True:
            params={'timeframe':timeframe,'start':first,'end':last,'adjustment':'all','feed':'sip','limit':10000,'sort':'asc'}
            if token: params['page_token']=token
            data=get_json('https://data.alpaca.markets/v2/stocks/SPY/bars?'+urlencode(params),headers)
            rows.extend(data.get('bars') or [])
            next_token=data.get('next_page_token')
            if not next_token: return rows
            if next_token==token: raise ValueError('SPY pagination did not advance')
            token=next_token
    start_at=datetime.fromisoformat(start+'T00:00:00').replace(tzinfo=ET_ZONE).isoformat()
    daily=bars('1Day',start_at,as_of)
    session=next((row for row in sessions if row['date']==end),None)
    captured=datetime.fromisoformat(as_of).astimezone(ET_ZONE)
    closing=datetime.fromisoformat(end+'T'+session['close']).replace(tzinfo=ET_ZONE) if session else None
    partial=bool(closing and captured<closing)
    open_at=datetime.fromisoformat(end+'T09:30:00').replace(tzinfo=ET_ZONE).isoformat()
    minute=bars('1Min',open_at,as_of) if partial else []
    return {'source':'Alpaca Market Data v2 SIP adjustment=all', 'sessions':sessions,
      'prices':[{'date':datetime.fromisoformat(r['t'].replace('Z','+00:00')).astimezone(ET_ZONE).date().isoformat(),'close':float(r['c'])} for r in daily],
      'minute_bars':minute}


def select_spy(source, as_of, end):
    captured=datetime.fromisoformat(as_of)
    if captured.tzinfo is None: raise ValueError('Live snapshot timezone missing')
    captured=captured.astimezone(ET_ZONE)
    sessions=source['sessions']
    session=next((r for r in sessions if r['date']==end),None)
    closing=datetime.fromisoformat(end+'T'+session['close']).replace(tzinfo=ET_ZONE) if session else None
    partial=bool(closing and captured<closing)
    prices=[dict(r) for r in source['prices'] if r['date']<=end and not (partial and r['date']==end)]
    last_quote=None
    if partial:
        completed=[]
        for row in source['minute_bars']:
            stamp=datetime.fromisoformat(row['t'].replace('Z','+00:00'))
            if stamp.astimezone(ET_ZONE).date().isoformat()==end and stamp+timedelta(minutes=1)<=captured:
                completed.append((stamp,row))
        if not completed: raise ValueError('No completed SPY minute by the live cutoff')
        stamp,row=max(completed,key=lambda item:item[0])
        if captured-(stamp+timedelta(minutes=1))>timedelta(minutes=2):
            raise ValueError('SPY current minute is stale')
        last_quote=row['t']
        prices.append({'date':end,'close':float(row['c'])})
    if len({r['date'] for r in prices})!=len(prices): raise ValueError('Duplicate SPY prices')
    return {'adjustment':'all','feed':'sip','source':'Alpaca Market Data v2',
      'session_dates':[r['date'] for r in sessions], 'prices':sorted(prices,key=lambda r:r['date']),
      'partial_session':partial,'last_quote_timestamp':last_quote}


def load_cash_source(start, end, paths=None):
    raw_files=[path.read_bytes() for path in paths] if paths else [
      get(TREASURY_URL+'?'+urlencode({'data':'daily_treasury_yield_curve','field_tdr_date_value':year}))
      for year in range((date.fromisoformat(start)-timedelta(days=14)).year,date.fromisoformat(end).year+1)]
    observations=[row for raw in raw_files for row in parse_treasury(raw)]
    observations=sorted([r for r in observations if date.fromisoformat(start)-timedelta(days=14)<=date.fromisoformat(r['date'])<=date.fromisoformat(end)],key=lambda r:r['date'])
    if not observations or len({row['date'] for row in observations})!=len(observations):
        raise ValueError('Treasury source observations missing or duplicated')
    return {'series':'UST_3MO_PAR','field':'BC_3MONTH','unit':'annual_percent',
      'source':'U.S. Treasury Daily Treasury Par Yield Curve Rates, 3-month',
      'source_url':TREASURY_URL,'source_sha256':[hashlib.sha256(raw).hexdigest() for raw in raw_files],
      'observations':observations,'accrual':'annual_percent / 100 / 365, daily calendar compounding',
      'rate_policy':'latest observation strictly before accrual day; at most 7 calendar days; no backfill'}


def validate_cash_source(start, end, source):
    """Prove every accrual interval before replacing any public asset."""
    first,last=date.fromisoformat(start),date.fromisoformat(end)
    if last<first: raise ValueError('Cash period reversed')
    observations=source.get('observations') or []
    rates=[]
    for row in observations:
        stamp=date.fromisoformat(row['date']);rate=row['annual_yield_pct']
        if not isinstance(rate,(int,float)) or isinstance(rate,bool) or not math.isfinite(rate) or not -5<=rate<=30:
            raise ValueError('Treasury annual-percent yield invalid')
        if stamp>last or (rates and stamp<=rates[-1][0]):
            raise ValueError('Treasury observations out of order or future-dated')
        rates.append((stamp,rate))
    if not rates: raise ValueError('Treasury observations missing')
    current=first;cursor=-1;index=100.0;maximum_age=0
    while current<last:
        while cursor+1<len(rates) and rates[cursor+1][0]<current: cursor+=1
        if cursor<0: raise ValueError('Treasury initial observation missing')
        age=(current-rates[cursor][0]).days
        if age>7: raise ValueError('Treasury carry exceeds seven calendar days')
        maximum_age=max(maximum_age,age)
        index*=1+rates[cursor][1]/100/365
        current+=timedelta(days=1)
    return {'calendar_accrual_days':(last-first).days,'maximum_carry_days':maximum_age,
      'unsupported_accrual_intervals':0,'end_index':index}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',type=Path,default=ROOT/'data/algo-pnl.json')
    parser.add_argument('--historical',type=Path,help='Historical comparison input; writes a separate cash-only artifact')
    parser.add_argument('--output',type=Path)
    parser.add_argument('--env-file',type=Path)
    parser.add_argument('--treasury-input',type=Path,action='append',help='Offline Treasury XML; repeat for multiple years')
    parser.add_argument('--spy-input',type=Path)
    parser.add_argument('--if-needed',action='store_true',help='Keep a valid historical artifact with the same validated period; no network request')
    args=parser.parse_args(argv)
    if args.if_needed and not args.historical: parser.error('--if-needed is historical-only')
    args.output=args.output or ROOT/('data/historical-cash-benchmark.json' if args.historical else 'data/live-benchmarks.json')
    if args.output.resolve()==args.live.resolve() or (args.historical and args.output.resolve()==args.historical.resolve()):
        raise ValueError('Benchmark output cannot replace performance research')
    if args.historical:
        historical=json.loads(args.historical.read_text())
        start,end=historical['dates'][0],historical['dates'][-1]
        if historical['initial_value']!=10000 or historical['comparison_start']!=start or historical['study_end']!=end:
            raise ValueError('Historical source period inconsistent')
        result={'schema':'foxchase-historical-cash-v1','base_index':100,'source_start':start,'source_end':end}
    else:
        live=json.loads(args.live.read_text());points=live['points']
        start,end=points[0]['date'],points[-1]['date'];as_of=live['updated_at']
        result={'schema':'foxchase-live-benchmarks-v1','base_index':100,'source_start':start,'source_end':end,'source_as_of':as_of}
    if args.if_needed and args.output.exists():
        try:
            existing=json.loads(args.output.read_text())
            if any(existing.get(key)!=result[key] for key in ('schema','base_index','source_start','source_end')) or (
              existing.get('cash',{}).get('series')!='UST_3MO_PAR' or existing['cash'].get('field')!='BC_3MONTH' or existing['cash'].get('unit')!='annual_percent'):
                raise ValueError('Historical cash source mismatch')
            validation=validate_cash_source(start,end,existing['cash'])
        except (ValueError,TypeError,KeyError):
            pass  # invalid/misaligned cache requires a fresh source, never a fallback rate
        else:
            print(json.dumps({'output':str(args.output),'start':start,'end':end,'status':'unchanged',**validation}))
            return 0
    result['generated_at']=datetime.now(timezone.utc).isoformat()
    try:
        result['cash']=load_cash_source(start,end,args.treasury_input)
        result['cash_validation']=validate_cash_source(start,end,result['cash'])
    except Exception as exc:
        # No replacement file, including on the initial run. Existing assets survive.
        # The caller guards this failure so canonical P&L publication still runs.
        print(json.dumps({'output':str(args.output),'start':start,'end':end,'cash_status':'failed',
          'reason':type(exc).__name__,'preserved_existing':args.output.exists()}))
        return 1
    if not args.historical:
        try:
            load_env(args.env_file)
            source=json.loads(args.spy_input.read_text()) if args.spy_input else fetch_spy(start,end,as_of)
            result['spy']=select_spy(source,as_of,end)
        except Exception as exc:
            result['spy']={'status':'unavailable','reason':type(exc).__name__}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temp=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',dir=args.output.parent,delete=False) as f:
            temp=Path(f.name)
            json.dump(result,f,indent=2,allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno())
        temp.chmod(0o644);temp.replace(args.output)
    finally:
        if temp is not None and temp.exists(): temp.unlink()
    print(json.dumps({'output':str(args.output),'start':start,'end':end,
      'cash_observations':len(result['cash']['observations']), 'spy_prices':len(result.get('spy',{}).get('prices',[])),
      'cash_status':result['cash'].get('status','available'), 'spy_status':result.get('spy',{}).get('status','not_requested' if args.historical else 'available')}))
    return 0


if __name__=='__main__': raise SystemExit(main())
