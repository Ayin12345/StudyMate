export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function searchLinks(query: string): { label: string; href: string }[] {
  const q = encodeURIComponent(query);
  return [
    { label: "Google", href: `https://www.google.com/search?q=${q}` },
    { label: "YouTube", href: `https://www.youtube.com/results?search_query=${q}` },
    { label: "Wikipedia", href: `https://en.wikipedia.org/w/index.php?search=${q}` },
  ];
}
