const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

async function main() {
    if (!config.GEMINI_API_KEY) {
        console.error('Error: GEMINI_API_KEY is not set in .env');
        process.exit(1);
    }

    const dataDir = path.join(__dirname, '..', 'data');
    const newsFile = path.join(dataDir, 'news.json');

    if (!fs.existsSync(newsFile)) {
        console.error('Error: news.json not found. Run fetchNews.js first.');
        process.exit(1);
    }

    const newsData = JSON.parse(fs.readFileSync(newsFile, 'utf-8'));
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

    // Use the model specified in config (user requested gemini-3.1-flash-lite-preview, etc.)
    console.log(`Using model: ${config.GEMINI_MODEL}`);
    const model = genAI.getGenerativeModel({
        model: config.GEMINI_MODEL,
        generationConfig: {
            responseMimeType: "application/json",
        }
    });

    const insights = {};

    for (const [category, items] of Object.entries(newsData)) {
        console.log(`\nGenerating insight for category: ${category}`);

        if (!items || items.length === 0) {
            console.log(`No news found for ${category}. Skipping.`);
            insights[category] = null;
            continue;
        }

        // Prepare prompt with recent news
        const newsText = items.slice(0, 10).map((item, index) =>
            `[${index + 1}] Title: ${item.title}\nSource: ${item.source}\nLink: ${item.link}\nSnippet: ${item.snippet}\n`
        ).join('\n');

        const prompt = `
You are an expert AI assistant for Sony's display development software engineers.
Your task is to review the following recent news articles in the category "${category}" and pick ONE most interesting/important topic to present as an icebreak at a morning meeting.
If the news is not directly relevant to displays, cameras, XR, or technology, try to find the tech angle.

Output a valid JSON object with the following structure:
{
  "title": "A catchy, short title for the slide (Japanese, max 40 chars)",
  "summary": "A summary of the news (Japanese, around 150 characters, capturing the main points clearly)",
  "insight": "A deep insight 'INSIGHT' tailored for display software engineers. Why does this matter? What is the technical implication? (Japanese, 3-4 sentences)",
  "sourceUrl": "The exact URL of the picked article from the provided list",
  "sourceName": "The name of the source (e.g. 4Gamer, The Verge)",
  "imagePrompt": "A detailed english prompt for image generation AI",
  "imageKeywords": "Most relevant and specific keywords for this news topic, comma-separated (e.g. 'quantum supercomputer,Sony lab,laser display')"
}

Here are the recent news articles:
${newsText}
`;

        try {
            const result = await model.generateContent(prompt);
            const response = result.response;
            const jsonText = response.text();

            // The response is expected to be a valid JSON string because of responseMimeType
            const parsed = JSON.parse(jsonText);
            insights[category] = parsed;
            console.log(`Success: ${parsed.title}`);
        } catch (error) {
            console.error(`Error generating insight for ${category}:`, error.message);
            insights[category] = null;
        }

        // Sleep briefly to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const outFile = path.join(dataDir, 'insights.json');
    fs.writeFileSync(outFile, JSON.stringify(insights, null, 2), 'utf-8');
    console.log(`\nSaved insights data to ${outFile}`);
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
