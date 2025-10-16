import fs from 'fs';
import path from 'path';

export default function(eleventyConfig) {
    eleventyConfig.addPassthroughCopy("src/css");
    eleventyConfig.addPassthroughCopy("src/js");
    eleventyConfig.addPassthroughCopy({"src/_data": "_data"});
  
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

    return {
      dir: {
        input: "src",
        output: "dist",
        includes: "_includes"
      }
    };
};

