import { LIBRARY_BOOKS, LIBRARY_FILTERS } from "./library-data.js";
import { filterLibraryBooks, findBookBySlug, pickRandomBook } from "./library-model.js";

const state = { category: "All", query: "" };

const grid = document.querySelector("#library-grid");
const filters = document.querySelector("#library-filters");
const search = document.querySelector("#library-search");
const resultCount = document.querySelector("#library-result-count");
const emptyState = document.querySelector("#library-empty");
const randomButton = document.querySelector("#library-random");
const dialog = document.querySelector("#book-dialog");
const dialogClose = document.querySelector("#book-dialog-close");
const dialogImage = document.querySelector("#book-dialog-image");
const dialogTitle = document.querySelector("#book-dialog-title");
const dialogAuthor = document.querySelector("#book-dialog-author");
const dialogEdition = document.querySelector("#book-dialog-edition");
const dialogPages = document.querySelector("#book-dialog-pages");
const dialogCategories = document.querySelector("#book-dialog-categories");
let activeTrigger = null;

function authorText(book) {
  if (book.authors.length === 1) return book.authors[0];
  if (book.authors.length === 2) return `${book.authors[0]} & ${book.authors[1]}`;
  return `${book.authors.slice(0, -1).join(", ")} & ${book.authors.at(-1)}`;
}

function makeTag(category) {
  const tag = document.createElement("span");
  tag.className = "library-tag";
  tag.textContent = category;
  return tag;
}

function visibleBooks() {
  return filterLibraryBooks(LIBRARY_BOOKS, state.category, state.query);
}

function createBookCard(book, index) {
  const article = document.createElement("article");
  article.className = "library-card";
  article.dataset.slug = book.slug;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "library-card-trigger";
  button.dataset.bookSlug = book.slug;
  button.setAttribute("aria-label", `Open details for ${book.title} by ${authorText(book)}`);

  const photoFrame = document.createElement("span");
  photoFrame.className = "library-photo-frame";
  const image = document.createElement("img");
  image.className = "library-photo";
  image.src = book.image;
  image.alt = `Adam's physical copy of ${book.title} by ${authorText(book)}`;
  image.loading = index < 4 ? "eager" : "lazy";
  image.decoding = "async";
  image.width = 1350;
  image.height = 1800;
  photoFrame.append(image);

  const copy = document.createElement("span");
  copy.className = "library-card-copy";
  const title = document.createElement("span");
  title.className = "library-card-title";
  title.textContent = book.title;
  const author = document.createElement("span");
  author.className = "library-card-author";
  author.textContent = authorText(book);
  const tags = document.createElement("span");
  tags.className = "library-tags";
  book.categories.forEach((category) => tags.append(makeTag(category)));
  copy.append(title, author, tags);
  button.append(photoFrame, copy);
  article.append(button);
  return article;
}

function renderBooks() {
  const books = visibleBooks();
  grid.replaceChildren(...books.map(createBookCard));
  resultCount.textContent = `${books.length} ${books.length === 1 ? "book" : "books"}`;
  emptyState.hidden = books.length > 0;
  randomButton.disabled = books.length === 0;
}

function renderFilters() {
  filters.replaceChildren(...LIBRARY_FILTERS.map((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-filter";
    button.textContent = filter;
    button.dataset.category = filter;
    button.setAttribute("aria-pressed", String(filter === state.category));
    return button;
  }));
}

function addStructuredData() {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "The Foxchase Trading Library",
    url: "https://www.foxchasetrading.com/library/",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: LIBRARY_BOOKS.length,
      itemListElement: LIBRARY_BOOKS.map((book, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Book",
          name: book.title,
          author: book.authors.map((author) => ({ "@type": "Person", name: author })),
          bookEdition: book.edition || undefined,
          numberOfPages: book.pageCount || undefined,
          image: `https://www.foxchasetrading.com${book.image}`,
          url: `https://www.foxchasetrading.com/library/#${book.slug}`
        }
      }))
    }
  });
  document.head.append(script);
}

function setHash(slug) {
  history.pushState(null, "", `${location.pathname}${location.search}#${encodeURIComponent(slug)}`);
}

function clearHash() {
  if (!location.hash) return;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function openBook(book, trigger = null, updateHash = true) {
  if (!book) return;
  activeTrigger = trigger;
  dialogImage.src = book.image;
  dialogImage.alt = `Adam's physical copy of ${book.title} by ${authorText(book)}`;
  dialogTitle.textContent = book.title;
  dialogAuthor.textContent = authorText(book);
  dialogEdition.textContent = book.edition || "";
  dialogEdition.hidden = !book.edition;
  dialogPages.textContent = book.pageCount ? `${book.pageCount.toLocaleString()} pages` : "";
  dialogPages.hidden = !book.pageCount;
  dialogCategories.replaceChildren(...book.categories.map(makeTag));
  dialog.dataset.slug = book.slug;
  if (!dialog.open) dialog.showModal();
  dialogClose.focus();
  if (updateHash && location.hash !== `#${book.slug}`) setHash(book.slug);
}

function openBookFromHash() {
  const slug = decodeURIComponent(location.hash.slice(1));
  if (!slug) return;
  const book = findBookBySlug(LIBRARY_BOOKS, slug);
  if (!book) return;
  const card = grid.querySelector(`[data-book-slug="${CSS.escape(slug)}"]`);
  openBook(book, card, false);
}

filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  filters.querySelectorAll("[data-category]").forEach((filter) => {
    filter.setAttribute("aria-pressed", String(filter === button));
  });
  renderBooks();
});

search.addEventListener("input", () => {
  state.query = search.value;
  renderBooks();
});

randomButton.addEventListener("click", () => {
  const books = visibleBooks();
  if (!books.length) return;
  const book = pickRandomBook(books);
  const card = grid.querySelector(`[data-book-slug="${CSS.escape(book.slug)}"]`);
  openBook(book, card);
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-book-slug]");
  if (!trigger || trigger.closest("#book-dialog")) return;
  openBook(findBookBySlug(LIBRARY_BOOKS, trigger.dataset.bookSlug), trigger);
});

dialogClose.addEventListener("click", () => dialog.close());

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  dialog.close();
});

dialog.addEventListener("close", () => {
  clearHash();
  dialogImage.removeAttribute("src");
  if (activeTrigger?.isConnected) activeTrigger.focus();
  activeTrigger = null;
});

window.addEventListener("hashchange", () => {
  if (!location.hash && dialog.open) {
    dialog.close();
    return;
  }
  openBookFromHash();
});

renderFilters();
renderBooks();
addStructuredData();
openBookFromHash();
