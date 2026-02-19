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
        
        // إبلاغ الجميع بتحديث القائمة
        io.to(roomId).emit("update-users", rooms[roomId].users);
        
        // --- تعديل هام هنا ---
        // إرسال خريطة Agora الحالية للمستخدم الجديد فوراً ليعرف من يفتح المايك حالياً
        socket.emit("update-agora-map", agoraMap);

        if(rooms[roomId].currentVideo) {
            socket.emit("video-changed", rooms[roomId].currentVideo);
        }
    });

    socket.on("map-agora-id", ({ uid }) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            agoraMap[uid] = socket.id;
            // إرسال التحديث للغرفة بالكامل لضمان التزامن
            io.to(roomId).emit("update-agora-map", agoraMap);
        }
    });

socket.on("change-video", (url) => {
    const roomId = socket.userData?.roomId;
    if (roomId) {
        // نرسل للجميع أمر ببدء العد التنازلي مع الرابط
        io.to(roomId).emit("start-countdown", url);
    }
});

// تأكد من تثبيت axios عبر: npm install axios
const axios = require('axios');
const TMDB_KEY = "63c062a2d817029ee9fe7760c74dea80"; // استبدله بمفتاحك لاحقاً

socket.on("chat-msg", async (text) => {
    const roomId = socket.userData?.roomId;
    if (!roomId) return;

    // إرسال رسالة المستخدم الأصلية
    io.to(roomId).emit("chat-msg", { text, user: socket.userData });

    const msg = text.trim().toLowerCase();

    // حالة 1: البحث عن فيلم محدد (مثال: بوت ابحث عن Batman)
    if (msg.startsWith("بوت ابحث عن")) {
        const query = msg.replace("بوت ابحث عن", "").trim();
        searchAndSendMovie(roomId, query);
    } 
    // حالة 2: اقتراح عشوائي (مثال: بوت اقترح فيلم)
    else if (msg.includes("بوت") && (msg.includes("اقترح") || msg.includes("فيلم"))) {
        suggestRandomMovie(roomId);
    }
});

// دالة البحث بالاسم
async function searchAndSendMovie(roomId, query) {
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=ar-SA`);
        if (res.data.results.length > 0) {
            sendMovieToRoom(roomId, res.data.results[0], "بحثت لك ووجدت هذا:");
        } else {
            io.to(roomId).emit("chat-msg", { text: "عذراً، لم أجد فيلماً بهذا الاسم! 🔍", user: { name: "الذكاء الاصطناعي 🤖", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ai" } });
        }
    } catch (e) { console.log(e); }
}

// دالة الاقتراح العشوائي
async function suggestRandomMovie(roomId) {
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_KEY}&language=ar-SA`);
        const randomMovie = res.data.results[Math.floor(Math.random() * res.data.results.length)];
        sendMovieToRoom(roomId, randomMovie, "ما رأيكم بهذا الاقتراح للسهرة؟");
    } catch (e) { console.log(e); }
}

// دالة موحدة لإرسال كارت الفيلم
// في server.js
function sendMovieToRoom(roomId, movie, intro) {
    const videoUrl = `https://vidsrc.me/embed/movie?tmdb=${movie.id}`;
    
    // تأكد من صياغة الرابط هكذا:
    const posterUrl = movie.poster_path 
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
        : `https://placehold.co/150x225?text=No+Poster`; // بديل يعمل بشكل أفضل

    io.to(roomId).emit("chat-msg", { 
        text: `${intro} **${movie.title}** 🎬`,
        suggestion: videoUrl,
        isSuggestion: true,
        poster: posterUrl, 
        user: { name: "الذكاء الاصطناعي 🤖", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ai" } 
    });
}

socket.on("disable-bot-button", (buttonId) => {
    const roomId = socket.userData?.roomId;
    if (roomId) {
        // إخبار الجميع في الغرفة بإخفاء الزر صاحب هذا الـ ID
        io.to(roomId).emit("hide-button", buttonId);
    }
});

    socket.on("video-control", (data) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            // استخدام broadcast لإرسال التحكم للآخرين فقط لتجنب تعليق صاحب الطلب
            socket.to(roomId).emit("video-sync", data);
        }
    });

    socket.on("chat-msg", (text) => {
    const roomId = socket.userData?.roomId;
    if (roomId) {
        io.to(roomId).emit("chat-msg", { text, user: socket.userData });

        const message = text.toLowerCase();
        if (message.includes("بوت") || message.includes("اقترح")) {
            
            // قائمة أفلام ذكية مع روابطها (يمكنك جلبها من TMDB لاحقاً)
            const movies = [
                { name: "Interstellar", url: "https://vidsrc.me/embed/movie?tmdb=157336" },
                { name: "Inception", url: "https://vidsrc.me/embed/movie?tmdb=27205" },
                { name: "The Dark Knight", url: "https://vidsrc.me/embed/movie?tmdb=155" },
                { name: "Spiderman: No Way Home", url: "https://vidsrc.me/embed/movie?tmdb=634649" }
            ];

            const movie = movies[Math.floor(Math.random() * movies.length)];
            
            setTimeout(() => {
                io.to(roomId).emit("chat-msg", { 
                    text: `أنصحكم بمشاهدة فيلم **${movie.name}**! 🎬`,
                    suggestion: movie.url, // نرسل الرابط كبيانات إضافية
                    isSuggestion: true,   // علامة لتمييز الرسالة في الطرف الأمامي
                    user: { name: "الذكاء الاصطناعي 🤖", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ai" } 
                });
            }, 1000);
        }
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
            
            // تنظيف الخريطة
            for (let uid in agoraMap) {
                if (agoraMap[uid] === socket.id) {
                    delete agoraMap[uid];
                }
            }
            io.to(roomId).emit("update-agora-map", agoraMap);
        }
        console.log("مستخدم غادر:", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 السيرفر يعمل على: http://localhost:${PORT}`));