
const asyncHandler = require("../utils/asyncHandler");
const { OpenAI } = require("openai");

let openai = null;

// Initialize OpenAI only when an API key is available.
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
} else {
    console.warn(
        "OPENAI_API_KEY is not configured. AI features will use mock data in development."
    );
}

// POST /api/ai/generate
const handleAiRequest = asyncHandler(async (req, res) => {
    const { prompt } = req.body || {};

    // Validate prompt.
    if (typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({
            success: false,
            message: "A valid prompt is required.",
        });
    }

    const cleanPrompt = prompt.trim();

    // Prevent excessively large prompts.
    if (cleanPrompt.length > 2000) {
        return res.status(400).json({
            success: false,
            message: "Prompt must not exceed 2000 characters.",
        });
    }

    // Use mock responses only during development.
    if (!openai) {
        if (process.env.NODE_ENV === "production") {
            return res.status(503).json({
                success: false,
                message: "AI service is currently unavailable.",
            });
        }

        console.log(
            "[AI Controller] Returning development mock suggestions."
        );

        const mockSuggestions = [
            `Top 5 ways to leverage ${cleanPrompt} for audience growth.`,
            `Behind the scenes: How I use ${cleanPrompt} every day.`,
            `The ultimate guide to ${cleanPrompt}.`,
            `Why ${cleanPrompt} is changing the creator economy.`,
        ];

        return res.status(200).json({
            success: true,
            data: mockSuggestions.join("\n"),
            source: "mock",
        });
    }

    // Generate content using OpenAI.
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a helpful content strategist. Generate creative and practical content suggestions for creators.",
                },
                {
                    role: "user",
                    content: `Generate content suggestions based on: ${cleanPrompt}`,
                },
            ],
            max_tokens: 250,
            temperature: 0.7,
        });

        const generatedContent =
            response.choices?.[0]?.message?.content?.trim();

        if (!generatedContent) {
            return res.status(502).json({
                success: false,
                message: "The AI service returned an empty response.",
            });
        }

        return res.status(200).json({
            success: true,
            data: generatedContent,
            source: "openai",
        });

    } catch (error) {
        console.error(
            "[AI Controller] OpenAI API request failed:",
            error.message
        );

        return res.status(502).json({
            success: false,
            message: "AI content generation failed. Please try again.",
        });
    }
});

module.exports = {
    handleAiRequest,
};
