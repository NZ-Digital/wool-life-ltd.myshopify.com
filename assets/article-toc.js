function makeAnchorId(text) {
  return encodeURIComponent(
    text.trim()
        .replace(/\s+/g, '-')                // spaces → hyphens
        .replace(/['‘’"“”]/g, '')            // remove quotes/apostrophes
        .replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '') // remove unsafe chars
  );
}

document.addEventListener('DOMContentLoaded', function () {
  console.log("TOC script running…");

  const toc = document.getElementById('toc');
  if (!toc) {
    console.log("❌ TOC container with id 'toc' not found.");
    return;
  }
  console.log("✅ TOC container found:", toc);

  const content = document.querySelector('.wl_single-column_inner');
  if (!content) {
    console.log("❌ Content container not found.");
    return;
  }
  console.log("✅ Content container found:", content);

  const headings = Array.from(content.querySelectorAll('h2, h3')).filter(h => {
    return h.textContent.trim().length > 0 &&
           window.getComputedStyle(h).display !== 'none';
  });

  console.log(`Found ${headings.length} headings (h2/h3):`, headings);

  if (headings.length < 2) {
    console.log("❌ Not enough headings to display TOC.");
    return;
  }

  const tocList = toc.querySelector('.toc-list');
  let currentH2Li = null;

  headings.forEach(heading => {
    if (!heading.id) {
      heading.id = makeAnchorId(heading.textContent);
      console.log(`Assigned ID: "${heading.textContent}" → ${heading.id}`);
    }

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${heading.id}`;
    a.textContent = heading.textContent;
    li.appendChild(a);

    if (heading.tagName === 'H2') {
      tocList.appendChild(li);
      currentH2Li = li;
    }

    if (heading.tagName === 'H3' && currentH2Li) {
      let sublist = currentH2Li.querySelector('ul');
      if (!sublist) {
        sublist = document.createElement('ul');
        currentH2Li.appendChild(sublist);
      }
      sublist.appendChild(li);
    }
  });

  toc.hidden = false;

  const offset = 100; // adjust for sticky header
  toc.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (!target) {
        console.log("❌ Target not found for link:", this.href);
        return;
      }
      const y = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      console.log("✅ Scrolled to:", target);
    });
  });
});
