export function filterLibraryBooks(books, category = "All", query = "") {
  const needle = query.trim().toLocaleLowerCase();
  return books.filter((book) => {
    const categoryMatch = category === "All" || book.categories.includes(category);
    const searchableText = `${book.title} ${book.authors.join(" ")}`.toLocaleLowerCase();
    return categoryMatch && (!needle || searchableText.includes(needle));
  });
}

export function findBookBySlug(books, slug) {
  return books.find((book) => book.slug === slug) || null;
}

export function pickRandomBook(books, randomValue = Math.random()) {
  if (!books.length) return null;
  const boundedValue = Math.min(Math.max(randomValue, 0), 0.999999999999);
  return books[Math.floor(boundedValue * books.length)];
}
