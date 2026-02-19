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
        // السيرفر يحفظ الرابط الحالي ويرسله للجميع فوراً
        rooms[roomId].currentVideo = url;
        io.to(roomId).emit("video-changed", url);
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