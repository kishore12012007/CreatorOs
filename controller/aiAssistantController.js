
const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const mongoose = require("mongoose");

const services = require("../services.config");
const AssistantChat = require("../model/assistantChat");
const ContentOs = require("../model/contentOs");

const {
    generateConversationalResponse,
    analyzeContentSeo,
    predictContentPerformance,
    generateHashtagMatrix,
    generateCreatorInsights,
} = require("../services/aiAssistantService");

const MAX_PROMPT_LENGTH = 5000;
const MAX_CONTENT_LENGTH = 10000;

// --------------------------------------------------
// Helper Functions
// --------------------------------------------------

const getUserId = (req) => {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
        const error = new Error("Authentication required");
        error.statusCode = 401;
        throw error;
    }

    return userId;
};

const validateText = (value, fieldName, maxLength = MAX_PROMPT_LENGTH) => {
    if (typeof value !== "string" || !value.trim()) {
        const error = new Error(`${fieldName} is required`);
        error.statusCode = 400;
        throw error;
    }

    if (value.length > maxLength) {
        const error = new Error(
            `${fieldName} must not exceed ${maxLength} characters`
        );
        error.statusCode = 400;
        throw error;
    }

    return value.trim();
};

const getRequestBody = (req) => {
    return req.validatedBody || req.body || {};
};

const validateChatId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const error = new Error("Invalid chat ID");
        error.statusCode = 400;
        throw error;
    }
};

// --------------------------------------------------
// Render Assistant Dashboard
// --------------------------------------------------

const renderAssistantView = asyncHandler(async (req, res) => {
    const userId = getUserId(req);

    const chats = await AssistantChat.find({ userId })
        .select("title platform tone length updatedAt")
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();

    const initialInsights = generateCreatorInsights({
        niche: req.user?.bio || "Digital Creator",
    });

    return res.render("ai-assistant", {
        title: "AI Creator Assistant - CreatorOS",
        activeNav: "ai-assistant",
        user: req.user,
        services,
        chats,
        initialInsights,
        csrfToken: req.csrfToken ? req.csrfToken() : "",
    });
});

// --------------------------------------------------
// Send Chat Message
// --------------------------------------------------

const sendMessage = asyncHandler(async (req, res) => {
    const userId = getUserId(req);

    const {
        prompt,
        platform,
        tone,
        length,
        chatId,
    } = getRequestBody(req);

    const cleanPrompt = validateText(prompt, "Prompt");

    let chatDoc = null;

    // Retrieve an existing chat if chatId is provided.
    if (chatId) {
        validateChatId(chatId);

        chatDoc = await AssistantChat.findOne({
            _id: chatId,
            userId,
        });

        if (!chatDoc) {
            return res.status(404).json({
                success: false,
                message: "Chat thread not found",
            });
        }
    } else {
        // Create a new chat.
        chatDoc = new AssistantChat({
            userId,
            title:
                cleanPrompt.length > 40
                    ? `${cleanPrompt.slice(0, 40)}...`
                    : cleanPrompt,
            platform: platform || "general",
            tone: tone || "energetic",
            length: length || "medium",
            messages: [],
        });
    }

    // Add user message.
    const userMessage = {
        messageId: crypto.randomUUID(),
        role: "user",
        content: cleanPrompt,
        createdAt: new Date(),
    };

    chatDoc.messages.push(userMessage);

    // Generate AI response.
    const aiResult = await generateConversationalResponse({
        prompt: cleanPrompt,
        platform: chatDoc.platform,
        tone: chatDoc.tone,
        length: length || chatDoc.length || "medium",
        history: chatDoc.messages,
    });

    // Validate AI response.
    if (!aiResult || typeof aiResult.content !== "string" ||
        !aiResult.content.trim()) {
        const error = new Error("AI service returned an invalid response");
        error.statusCode = 502;
        throw error;
    }

    // Add assistant message.
    const assistantMsg = {
        messageId: crypto.randomUUID(),
        role: "assistant",
        content: aiResult.content.trim(),
        structuredData: {
            suggestions: aiResult.suggestions ?? [],
            seoScore: aiResult.seoScore ?? null,
            viralityScore: aiResult.viralityScore ?? null,
            keywords: aiResult.keywords ?? [],
            hashtags: aiResult.hashtags ?? [],
            ctas: aiResult.ctas ?? [],
        },
        createdAt: new Date(),
    };

    chatDoc.messages.push(assistantMsg);

    await chatDoc.save();

    return res.status(200).json({
        success: true,
        data: {
            chatId: chatDoc._id,
            title: chatDoc.title,
            message: assistantMsg,
        },
    });
});

// --------------------------------------------------
// Get All Chats
// --------------------------------------------------

const getChats = asyncHandler(async (req, res) => {
    const userId = getUserId(req);

    const chats = await AssistantChat.find({ userId })
        .select("title platform tone length updatedAt")
        .sort({ updatedAt: -1 })
        .lean();

    return res.json({
        success: true,
        data: chats,
    });
});

// --------------------------------------------------
// Get Chat By ID
// --------------------------------------------------

const getChatById = asyncHandler(async (req, res) => {
    const userId = getUserId(req);

    validateChatId(req.params.id);

    const chat = await AssistantChat.findOne({
        _id: req.params.id,
        userId,
    }).lean();

    if (!chat) {
        return res.status(404).json({
            success: false,
            message: "Chat thread not found",
        });
    }

    return res.json({
        success: true,
        data: chat,
    });
});

// --------------------------------------------------
// Delete Chat
// --------------------------------------------------

const deleteChat = asyncHandler(async (req, res) => {
    const userId = getUserId(req);

    validateChatId(req.params.id);

    const result = await AssistantChat.deleteOne({
        _id: req.params.id,
        userId,
    });

    if (result.deletedCount === 0) {
        return res.status(404).json({
            success: false,
            message: "Chat thread not found",
        });
    }

    return res.json({
        success: true,
        message: "Chat thread deleted successfully",
    });
});

// --------------------------------------------------
// SEO Tool
// --------------------------------------------------

const runSeoTool = asyncHandler(async (req, res) => {
    const { text, platform } = getRequestBody(req);

    const cleanText = validateText(text, "Content", MAX_CONTENT_LENGTH);

    const analysis = analyzeContentSeo(cleanText, platform);

    return res.json({
        success: true,
        data: analysis,
    });
});

// --------------------------------------------------
// Content Performance Predictor
// --------------------------------------------------

const runPredictorTool = asyncHandler(async (req, res) => {
    const { text, platform } = getRequestBody(req);

    const cleanText = validateText(text, "Content", MAX_CONTENT_LENGTH);

    const prediction = predictContentPerformance(cleanText, platform);

    return res.json({
        success: true,
        data: prediction,
    });
});

// --------------------------------------------------
// Hashtag Generator
// --------------------------------------------------

const runHashtagTool = asyncHandler(async (req, res) => {
    const { text, platform } = getRequestBody(req);

    const cleanText = validateText(text, "Content", MAX_CONTENT_LENGTH);

    const matrix = generateHashtagMatrix(cleanText, platform);

    return res.json({
        success: true,
        data: matrix,
    });
});

// --------------------------------------------------
// Creator Insights
// --------------------------------------------------

const runInsightsTool = asyncHandler(async (req, res) => {
    getUserId(req);

    const insights = generateCreatorInsights({
        niche: req.user?.bio || "Digital Creator",
    });

    return res.json({
        success: true,
        data: insights,
    });
});

// --------------------------------------------------
// Export to Content OS
// --------------------------------------------------

const exportToContentOs = asyncHandler(async (req, res) => {
    const userId = getUserId(req);

    const {
        title,
        description,
        platform,
        type,
    } = getRequestBody(req);

    const cleanTitle = validateText(title, "Title", 100);

    if (description !== undefined && typeof description !== "string") {
        return res.status(400).json({
            success: false,
            message: "Description must be a string",
        });
    }

    if (description && description.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({
            success: false,
            message: "Description is too long",
        });
    }

    const newContentItem = new ContentOs({
        userId,
        title: cleanTitle,
        description: description || "",
        type: type || "idea",
        status: "idea",
        platform: platform || "general",
        priority: "medium",
    });

    await newContentItem.save();

    return res.status(201).json({
        success: true,
        message: "Successfully exported to Content OS!",
        data: newContentItem,
    });
});

// --------------------------------------------------
// Export Controllers
// --------------------------------------------------

module.exports = {
    renderAssistantView,
    sendMessage,
    getChats,
    getChatById,
    deleteChat,
    runSeoTool,
    runPredictorTool,
    runHashtagTool,
    runInsightsTool,
    exportToContentOs,
};
