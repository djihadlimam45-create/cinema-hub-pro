const axios = require('axios');
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};
let agoraMap = {}; 
const TMDB_KEY = "63c062a2d817029ee9fe7760c74dea80";

io.on("connection", (socket) => {
    console.log("مستخدم متصل جديد:", socket.id);

    socket.on("join-room", ({ roomId, password, user }) => {
        if (rooms[roomId] && rooms[roomId].password !== password) {
            return socket.emit("error-msg", "كلمة المرور خاطئة!");
        }

        socket.join(roomId);
        socket.userData = { ...user, roomId, id: socket.id };

        if (!rooms[roomId]) {
            rooms[roomId] = { password: password, users: [], currentVideo: "" };
        }

        rooms[roomId].users.push(socket.userData);
        socket.emit("join-success");
        io.to(roomId).emit("update-users", rooms[roomId].users);
        socket.emit("update-agora-map", agoraMap);

        if(rooms[roomId].currentVideo) {
            socket.emit("video-changed", rooms[roomId].currentVideo);
        }
    });

    socket.on("map-agora-id", ({ uid }) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            agoraMap[uid] = socket.id;
            io.to(roomId).emit("update-agora-map", agoraMap);
        }
    });

    // التحكم في الفيديو والعد التنازلي
    socket.on("change-video", (url) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            rooms[roomId].currentVideo = url;
            // نرسل للجميع أمر ببدء العد التنازلي مع الرابط
            io.to(roomId).emit("start-countdown", url);
        }
    });

    // الشات ونظام البوت الذكي (تم الدمج هنا)
    socket.on("chat-msg", async (text) => {
        const roomId = socket.userData?.roomId;
        if (!roomId) return;

        // إرسال رسالة المستخدم الأصلية للجميع
        io.to(roomId).emit("chat-msg", { text, user: socket.userData });

        const msg = text.trim().toLowerCase();

        // 1. البحث بالاسم
        if (msg.startsWith("بوت ابحث عن")) {
            const query = msg.replace("بوت ابحث عن", "").trim();
            searchAndSendMovie(roomId, query);
        } 
        // 2. الاقتراح العشوائي
        else if (msg.includes("بوت") && (msg.includes("اقترح") || msg.includes("فيلم"))) {
            suggestRandomMovie(roomId);
        }
    });

    // تعطيل زر البوت بعد الضغط عليه
    socket.on("disable-bot-button", (buttonId) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            io.to(roomId).emit("hide-button", buttonId);
        }
    });

    socket.on("video-control", (data) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            socket.to(roomId).emit("video-sync", data);
        }
    });

    socket.on("reaction", (emoji) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            io.to(roomId).emit("reaction", { emoji, userId: socket.id });
        }
    });

    socket.on("disconnect", () => {
        const roomId = socket.userData?.roomId;
        if (rooms[roomId]) {
            rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
            io.to(roomId).emit("update-users", rooms[roomId].users);
            for (let uid in agoraMap) {
                if (agoraMap[uid] === socket.id) delete agoraMap[uid];
            }
            io.to(roomId).emit("update-agora-map", agoraMap);
        }
    });
});

// --- الدوال المساعدة للبوت ---

async function searchAndSendMovie(roomId, query) {
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=ar-SA`);
        if (res.data.results.length > 0) {
            sendMovieToRoom(roomId, res.data.results[0], "بحثت لك ووجدت هذا الفيلم:");
        } else {
            sendErrorMessage(roomId, "عذراً، لم أجد فيلماً بهذا الاسم! 🔍");
        }
    } catch (e) { console.log("TMDB Search Error:", e); }
}

async function suggestRandomMovie(roomId) {
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_KEY}&language=ar-SA`);
        const randomMovie = res.data.results[Math.floor(Math.random() * res.data.results.length)];
        sendMovieToRoom(roomId, randomMovie, "ما رأيكم بهذا الاقتراح للسهرة؟");
    } catch (e) { console.log("TMDB Trending Error:", e); }
}

function sendMovieToRoom(roomId, movie, intro) {
    // بناء رابط vidsrc بشكل صحيح
    const videoUrl = `https://vidsrc.me/embed/movie?tmdb=${movie.id}`;
    const posterUrl = movie.poster_path 
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
        : `https://placehold.co/200x300/222/fff?text=No+Poster`;

    io.to(roomId).emit("chat-msg", { 
        text: `${intro} **${movie.title}** 🎬`,
        suggestion: videoUrl,
        isSuggestion: true,
        poster: posterUrl, 
        user: { name: "الذكاء الاصطناعي 🤖", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ai" } 
    });
}

function sendErrorMessage(roomId, text) {
    io.to(roomId).emit("chat-msg", { 
        text, 
        user: { name: "الذكاء الاصطناعي 🤖", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ai" } 
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 السيرفر يعمل على: http://localhost:${PORT}`));