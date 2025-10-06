module.exports = function(eleventyConfig) {
  // Set the source and output directories
  const dir = {
    input: "src",
    output: "dist",
    includes: "_includes",
    data: "_data"
  };

  // Pass through static assets (CSS, JS)
  eleventyConfig.addPassthroughCopy(`${dir.input}/css`);
  eleventyConfig.addPassthroughCopy(`${dir.input}/js`);

  // **THIS IS THE FIX**: Copy the _data directory to the output,
  // making its contents (like questions.json) accessible to fetch().
  eleventyConfig.addPassthroughCopy(`${dir.input}/_data`);

  return {
    dir: dir,
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
