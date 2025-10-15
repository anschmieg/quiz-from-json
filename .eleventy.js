export default function(eleventyConfig) {
    eleventyConfig.addPassthroughCopy("src/css");
    eleventyConfig.addPassthroughCopy("src/js"); // Copies both quiz.js and stats.js
    eleventyConfig.addPassthroughCopy({"src/_data": "_data"});
  
    // Add a filter to find the current page for active nav link styling
    eleventyConfig.addFilter("isCurrentPage", (itemUrl, pageUrl) => {
      // A simple check to see if the URL is for the current page
      // This will handle both "/" and "/stats/"
      if (itemUrl === "/" && pageUrl === "/") {
        return true;
      }
      if (itemUrl.length > 1 && pageUrl.startsWith(itemUrl)) {
        return true;
      }
      return false;
    });

    // Add an active class to the nav link for the current page
    eleventyConfig.addNunjucksShortcode("navLink", function(url, text) {
        const isActive = (this.page.url === url);
        return `<a href="${url}" class="nav-link"${isActive ? ' aria-current="page"' : ''}>${text}</a>`;
    });

    return {
      dir: {
        input: "src",
        output: "dist",
        includes: "_includes"
      }
    };
};

