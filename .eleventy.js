import fs from 'fs';
import path from 'path';

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy({ "src/img": "img" });
  eleventyConfig.addPassthroughCopy({ "src/_data": "_data" });

  // Add a global data collection for all quizzes
  eleventyConfig.addGlobalData("quizzes", () => {
    const dataDir = path.join(process.cwd(), 'src', '_data');
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

    return files.map(filename => {
      const quizId = path.basename(filename, '.json');
      const content = JSON.parse(fs.readFileSync(path.join(dataDir, filename), 'utf-8'));
      return {
        id: quizId,
        title: content.title || 'Untitled Quiz',
        shorttitle: content.shorttitle || quizId,
        questionCount: content.questions?.length || 0
      };
    });
  });

  // Compose gauge SVGs from fragments at build-time so the client can reference
  // /img/gauge-<difficulty>.svg without runtime inlining. This runs when Eleventy
  // loads the config during dev or build.
  try {
    const fragmentsDir = path.join(process.cwd(), 'src', '_includes', 'svg-fragments');
    const outDir = path.join(process.cwd(), 'src', 'img');
    if (!fs.existsSync(fragmentsDir)) {
      // nothing to do
    } else {
      const base = fs.readFileSync(path.join(fragmentsDir, 'gauge-base.svg'), 'utf-8');
      const ticks = fs.readFileSync(path.join(fragmentsDir, 'ticks-side.svg'), 'utf-8');
      const top = fs.readFileSync(path.join(fragmentsDir, 'tick-top.svg'), 'utf-8');
      const pointerFrag = fs.readFileSync(path.join(fragmentsDir, 'pointer.svg'), 'utf-8');

      // Small helper to compose an outer svg and insert fragments. We remove outer
      // <svg> wrappers from fragments and insert the inner groups.
      function unwrapFragment(svgText) {
        // strip opening <svg ...> and trailing </svg>
        return svgText.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
      }

      const baseInner = unwrapFragment(base);
      const ticksInner = unwrapFragment(ticks);
      const topInner = unwrapFragment(top);
      const pointerInner = pointerFrag; // pointer.svg is already a <g>

      const difficulties = {
        easy: { rotation: 0, colorClass: 'easy' },
        medium: { rotation: 68, colorClass: 'medium' },
        hard: { rotation: 136, colorClass: 'hard' }
      };

      Object.keys(difficulties).forEach(name => {
        const { rotation } = difficulties[name];
        // Compose: outer svg uses same viewBox as fragments and fill=currentColor
        const composed = `<?xml version="1.0" encoding="utf-8"?>\n<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor" role="img" aria-hidden="true">\n  <g class="gauge-base">${baseInner}</g>\n  <g class="gauge-ticks">${ticksInner}${topInner}</g>\n  <g class="gauge-pointer" data-difficulty="${name}">\n    ${pointerInner.replace(/transform="rotate\(0, 256, 307\)"/, `transform=\"rotate(${rotation}, 256, 307)\"`)}\n  </g>\n</svg>`;

        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `gauge-${name}.svg`), composed, 'utf-8');
      });
    }
  } catch (err) {
    // don't fail the whole build if svg composition fails; log to console
    console.error('SVG composition error:', err);
  }

  return {
    dir: {
      input: "src",
      output: "dist",
      includes: "_includes"
    }
  };
};

