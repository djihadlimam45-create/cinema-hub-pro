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
        // 1. إرسال رسالة المستخدم العادية للجميع
        io.to(roomId).emit("chat-msg", { text, user: socket.userData });

        // 2. منطق الذكاء الاصطناعي (البوت)
        const botTrigger = ["بوت", "اقترح", "اقتراح", "فيلم"];
        const message = text.toLowerCase();

        if (botTrigger.some(word => message.includes(word))) {
            // هنا نحدد مصفوفة اقتراحات (يمكنك توسيعها لاحقاً)
            const suggestions = [
                "أنصحكم بمشاهدة فيلم Interstellar إذا كنتم تحبون الخيال العلمي والدراما! 🌌",
                "ما رأيكم في فيلم Parasite؟ فيلم كوري أسطوري وحائز على الأوسكار! 🎭",
                "إذا كنتم تبحثون عن رعب حقيقي، شاهدوا The Conjuring 👻",
                "لقضاء وقت ممتع مع الأصدقاء، أنصحكم بفيلم Inception 🌀",
                "لعشاق الأكشن، سلسلة John Wick لا تُعلى عليها! 🔥"
            ];

            const randomReply = suggestions[Math.floor(Math.random() * suggestions.length)];

            // إرسال رد البوت بعد ثانية واحدة ليبدو وكأنه يفكر
            setTimeout(() => {
                io.to(roomId).emit("chat-msg", { 
                    text: randomReply, 
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