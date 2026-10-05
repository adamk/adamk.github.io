import importlib.util
from pathlib import Path
import unittest
import tempfile
import contextlib
import io
import json
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / 'scripts/refresh_live_benchmarks.py'
if FILE.exists():
    spec = importlib.util.spec_from_file_location('refresh', FILE)
    refresh = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(refresh)
else:
    refresh = None

class RefreshTests(unittest.TestCase):
    def run_publisher(self, folder, end='2026-05-06', historical=False, existing=None, extra=None):
        source=Path(folder)/'source.json';output=Path(folder)/'benchmark.json'
        payload={'dates':['2026-05-04',end], 'initial_value':10000,
          'comparison_start':'2026-05-04','study_end':end} if historical else {
          'points':[{'date':'2026-05-04'},{'date':end}], 'updated_at':end+'T16:15:00-04:00'}
        source.write_text(json.dumps(payload))
        if existing is not None: output.write_bytes(existing)
        args=['--historical' if historical else '--live',str(source),'--output',str(output)]
        stream=io.StringIO()
        with contextlib.redirect_stdout(stream): code=refresh.main(args+(extra or []))
        return code,output,json.loads(stream.getvalue())

    def test_treasury_failure_preserves_last_known_good_without_fetching_spy(self):
        old=b'{"last_known_good":true}\n'
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh,'load_cash_source',side_effect=TimeoutError), patch.object(refresh,'fetch_spy') as spy:
            code,path,report=self.run_publisher(folder,existing=old)
            self.assertEqual(code,1)
            self.assertEqual(path.read_bytes(),old)
            self.assertTrue(report['preserved_existing'])
            spy.assert_not_called()

    def test_stale_treasury_source_preserves_last_known_good(self):
        source={'observations':[{'date':'2026-05-01','annual_yield_pct':3.65}]}
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh,'load_cash_source',return_value=source):
            code,path,_=self.run_publisher(folder,end='2026-05-12',existing=b'good')
            self.assertEqual(code,1)
            self.assertEqual(path.read_bytes(),b'good')

    def test_missing_initial_rate_does_not_publish_unavailable_replacement(self):
        source={'observations':[{'date':'2026-05-04','annual_yield_pct':3.65}]}
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh,'load_cash_source',return_value=source):
            code,path,report=self.run_publisher(folder)
            self.assertEqual(code,1)
            self.assertFalse(path.exists())
            self.assertFalse(report['preserved_existing'])

    def test_cash_coverage_validation_matches_calendar_day_accrual(self):
        self.assertTrue(callable(getattr(refresh,'validate_cash_source',None)))
        source={'observations':[{'date':'2026-05-01','annual_yield_pct':3.65}]}
        report=refresh.validate_cash_source('2026-05-04','2026-05-06',source)
        self.assertEqual(report['calendar_accrual_days'],2)
        self.assertEqual(report['maximum_carry_days'],4)
        self.assertEqual(report['unsupported_accrual_intervals'],0)
        self.assertAlmostEqual(report['end_index'],100*1.0001**2,places=12)

    def test_seven_day_carry_limit_inclusive_but_not_eight(self):
        self.assertTrue(callable(getattr(refresh,'validate_cash_source',None)))
        source={'observations':[{'date':'2026-05-01','annual_yield_pct':3.65}]}
        self.assertEqual(refresh.validate_cash_source('2026-05-08','2026-05-09',source)['maximum_carry_days'],7)
        with self.assertRaises(ValueError): refresh.validate_cash_source('2026-05-09','2026-05-10',source)

    def test_unchanged_valid_historical_artifact_skips_network_and_writes(self):
        existing=json.dumps({'schema':'foxchase-historical-cash-v1','base_index':100,
          'source_start':'2026-05-04','source_end':'2026-05-06','cash':{
          'series':'UST_3MO_PAR','field':'BC_3MONTH','unit':'annual_percent',
          'observations':[{'date':'2026-05-01','annual_yield_pct':3.65}]}}).encode()
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh,'load_cash_source') as source, patch.object(refresh,'fetch_spy') as spy:
            code,path,report=self.run_publisher(folder,historical=True,existing=existing,extra=['--if-needed'])
            self.assertEqual(code,0)
            self.assertEqual(path.read_bytes(),existing)
            self.assertEqual(report['status'],'unchanged')
            source.assert_not_called();spy.assert_not_called()

    def test_invalid_historical_cache_cannot_skip_validation(self):
        old=json.dumps({'schema':'foxchase-historical-cash-v1','base_index':100,
          'source_start':'2026-05-04','source_end':'2026-05-06','cash':{
          'series':'UST_3MO_PAR','field':'BC_3MONTH','unit':'annual_percent','observations':[]}}).encode()
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh,'load_cash_source',side_effect=TimeoutError) as source:
            code,path,_=self.run_publisher(folder,historical=True,existing=old,extra=['--if-needed'])
            self.assertEqual(code,1)
            self.assertEqual(path.read_bytes(),old)
            source.assert_called_once()

    def test_common_treasury_source_spans_years_without_future_observations(self):
        self.assertTrue(callable(getattr(refresh, 'load_cash_source', None)))
        def xml(day, rate):
            return f'<feed xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices"><entry><d:NEW_DATE>{day}T00:00:00</d:NEW_DATE><d:BC_3MONTH>{rate}</d:BC_3MONTH></entry></feed>'
        with tempfile.TemporaryDirectory() as folder:
            files=[]
            for i,(day,rate) in enumerate([('2022-12-30','4.2'),('2023-01-03','4.3'),('2024-01-02','5.4'),('2024-01-03','9.9')]):
                path=Path(folder)/f'{i}.xml';path.write_text(xml(day,rate));files.append(path)
            out=refresh.load_cash_source('2023-01-04','2024-01-02',files)
        self.assertEqual(out['unit'],'annual_percent')
        self.assertEqual(out['series'],'UST_3MO_PAR')
        self.assertEqual([r['date'] for r in out['observations']],['2022-12-30','2023-01-03','2024-01-02'])
        self.assertEqual(len(out['source_sha256']),4)

    def test_treasury_exact_field_and_percent_unit(self):
        self.assertIsNotNone(refresh)
        xml = b'''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices"><entry><d:NEW_DATE>2026-05-01T00:00:00</d:NEW_DATE><d:BC_3MONTH>3.65</d:BC_3MONTH><d:BC_6MONTH>9.99</d:BC_6MONTH></entry></feed>'''
        self.assertEqual(refresh.parse_treasury(xml), [{'date':'2026-05-01','annual_yield_pct':3.65}])

    def test_partial_bar_must_be_complete_by_cutoff(self):
        self.assertIsNotNone(refresh)
        source = {'sessions':[{'date':'2026-05-04','close':'16:00'}], 'prices':[],
          'minute_bars':[{'t':'2026-05-04T14:59:00Z','c':500}, {'t':'2026-05-04T15:00:00Z','c':900}]}
        out = refresh.select_spy(source, '2026-05-04T11:00:03-04:00', '2026-05-04')
        self.assertEqual(out['prices'][0]['close'], 500)
        self.assertTrue(out['partial_session'])
        self.assertEqual(out['last_quote_timestamp'], '2026-05-04T14:59:00Z')

    def test_partial_quote_staleness_fails(self):
        self.assertIsNotNone(refresh)
        source = {'sessions':[{'date':'2026-05-04','close':'16:00'}], 'prices':[],
          'minute_bars':[{'t':'2026-05-04T14:00:00Z','c':500}]}
        with self.assertRaises(ValueError):
            refresh.select_spy(source,'2026-05-04T11:00:03-04:00','2026-05-04')

    def test_adjusted_daily_prices_and_no_midday_future_close(self):
        self.assertIsNotNone(refresh)
        source = {'sessions':[{'date':'2026-05-04','close':'16:00'}],
          'prices':[{'date':'2026-05-04','close':999}], 'minute_bars':[]}
        with self.assertRaises(ValueError):
            refresh.select_spy(source,'2026-05-04T11:00:03-04:00','2026-05-04')
        out=refresh.select_spy(source,'2026-05-04T20:00:03-04:00','2026-05-04')
        self.assertEqual(out['prices'][0]['close'],999)
        self.assertFalse(out['partial_session'])

if __name__ == '__main__': unittest.main()
