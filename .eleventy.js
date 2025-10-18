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
  // /img/gauge-<difficulty>.svg without runtime inlining. We'll expose a helper
  // function and run it on Eleventy 'beforeBuild' and watch the fragments dir so
  // dev-server live reload will pick up changes.
  const fragmentsDir = path.join(process.cwd(), 'src', '_includes', 'svg-fragments');
  const outDir = path.join(process.cwd(), 'src', 'img');

  function unwrapFragment(svgText) {
    return svgText.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '');
  }

  function composeSvgFragments() {
    try {
      if (!fs.existsSync(fragmentsDir)) return;
      const base = fs.readFileSync(path.join(fragmentsDir, 'gauge-base.svg'), 'utf-8');
      const ticks = fs.readFileSync(path.join(fragmentsDir, 'ticks-side.svg'), 'utf-8');
      const top = fs.readFileSync(path.join(fragmentsDir, 'tick-top.svg'), 'utf-8');
      const pointerFrag = fs.readFileSync(path.join(fragmentsDir, 'pointer.svg'), 'utf-8');

      const baseInner = unwrapFragment(base);
      const ticksInner = unwrapFragment(ticks);
      const topInner = unwrapFragment(top);
      const pointerInner = pointerFrag; // pointer.svg is a <g>

      const difficulties = {
        easy: { rotation: 0 },
        medium: { rotation: 68 },
        hard: { rotation: 136 }
      };

      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      Object.keys(difficulties).forEach(name => {
        const { rotation } = difficulties[name];
        // Keep pointer fragment using currentColor so the composed SVG inherits the surrounding
        // CSS color (currentColor) when inlined. We still apply rotation per difficulty.
        let composed = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor" role="img" aria-hidden="true">\n  <g class="gauge-base">${baseInner}</g>\n  <g class="gauge-ticks">${ticksInner}${topInner}</g>\n  <g class="gauge-pointer" data-difficulty="${name}">\n    ${pointerInner.replace(/transform=\"rotate\(0, 256, 307\)\"/, `transform=\"rotate(${rotation}, 256, 307)\"`)}\n  </g>\n</svg>`;

        // Minify the composed SVG string before writing to disk
        composed = minifySvg(composed);

        fs.writeFileSync(path.join(outDir, `gauge-${name}.svg`), composed, 'utf-8');
      });

      // Remove legacy filenames that may have accumulated from earlier iterations
      const legacy = ['gauge-low.svg', 'gauge-high.svg'];
      legacy.forEach(fn => {
        const p = path.join(outDir, fn);
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
      });
    } catch (err) {
      console.error('SVG composition error:', err);
    }
  }

  // Lightweight SVG minifier: strip comments and excess whitespace while leaving
  // attributes intact. This is intentionally small to avoid adding dependencies.
  function minifySvg(svg) {
    return svg
      .replace(/<!--[^>]*-->/g, '') // remove comments
      .replace(/>\s+</g, '><') // remove inter-tag whitespace
      .replace(/\s{2,}/g, ' ') // collapse multiple spaces
      .trim();
  }

  // Shortcode: inline or fallback img for gauge
  eleventyConfig.addShortcode('gauge', function (difficulty = 'medium', opts = {}) {
    const safe = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const file = path.join(process.cwd(), 'src', 'img', `gauge-${safe}.svg`);
    if (!fs.existsSync(file)) {
      console.warn(`gauge shortcode: missing file ${file}`);
      return `<!-- gauge:${safe} missing -->`;
    }

    let svg = fs.readFileSync(file, 'utf8');

    // Always inline the SVG so it can inherit currentColor. The `asImg` option is
    // intentionally ignored to avoid rasterized <img> usage which cannot inherit
    // the surrounding color. This ensures badges and gauges always match CSS vars.

    // Inline: inject title/aria if provided, and width/height/class attributes
    // Remove any xml prolog if present (shouldn't be)
    svg = svg.replace(/^<\?xml[\s\S]*?\?>\s*/, '');

    // inject size
    if (opts.size) {
      svg = svg.replace('<svg ', `<svg width="${opts.size}" height="${opts.size}" `);
    }

    // inject class
    if (opts.class) {
      svg = svg.replace('<svg ', `<svg class="${opts.class}" `);
    }

    // inject title/aria
    if (opts.title) {
      const id = `gauge-title-${safe}-${Math.random().toString(36).slice(2, 8)}`;
      svg = svg.replace('<svg ', `<svg aria-labelledby="${id}" `);
      svg = svg.replace(/<svg[^>]*>/, match => `${match}<title id="${id}">${opts.title}</title>`);
    }

    return svg;
  });

  // Watch fragments in dev so edits trigger a rebuild
  eleventyConfig.addWatchTarget(fragmentsDir);
  eleventyConfig.on('beforeBuild', () => composeSvgFragments());

  // Run once now so files are present for the first build
  composeSvgFragments();

  return {
    dir: {
      input: "src",
      output: "dist",
      includes: "_includes"
    }
  };
};

