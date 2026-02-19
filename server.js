const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// تخزين بيانات الغرف والمعرفات
const rooms = {};
let agoraMap = {}; // جسر الربط: UID (الصوت) -> Socket ID (المستخدم)

io.on("connection", (socket) => {
    console.log("مستخدم متصل جديد:", socket.id);

    socket.on("join-room", ({ roomId, password, user }) => {
        // التحقق من كلمة المرور
        if (rooms[roomId] && rooms[roomId].password !== password) {
            return socket.emit("error-msg", "كلمة المرور خاطئة!");
        }

        socket.join(roomId);
        // حفظ بيانات المستخدم في السوكيت الحالي
        socket.userData = { ...user, roomId, id: socket.id };

        // إنشاء الغرفة إذا لم تكن موجودة
        if (!rooms[roomId]) {
            rooms[roomId] = { password: password, users: [], currentVideo: "" };
        }

        // إضافة المستخدم لقائمة الغرفة
        rooms[roomId].users.push(socket.userData);
        
        socket.emit("join-success");
        
        // إبلاغ الجميع بتحديث القائمة (لرسم الأفاتارات)
        io.to(roomId).emit("update-users", rooms[roomId].users);
        
        // مزامنة الفيديو الحالي للمنضم الجديد
        if(rooms[roomId].currentVideo) {
            socket.emit("video-changed", rooms[roomId].currentVideo);
        }

        // إرسال خريطة الربط الصوتية المحدثة
        io.to(roomId).emit("update-agora-map", agoraMap);
    });

    // --- أهم جزء: ربط معرف الصوت بمعرف السوكيت ---
    socket.on("map-agora-id", ({ uid }) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            agoraMap[uid] = socket.id; // ربط الـ UID بـ Socket ID
            // نرسل الخريطة المحدثة للجميع ليتمكنوا من معرفة من يتحدث
            io.to(roomId).emit("update-agora-map", agoraMap);
        }
    });

    // تغيير الفيديو
    socket.on("change-video", (url) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            rooms[roomId].currentVideo = url;
            io.to(roomId).emit("video-changed", url);
        }
    });

    // التحكم في المزامنة (Play/Pause/Seek)
    socket.on("video-control", (data) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            socket.to(roomId).emit("video-sync", data);
        }
    });

    // رسائل الشات
    socket.on("chat-msg", (text) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            io.to(roomId).emit("chat-msg", { text, user: socket.userData });
        }
    });

    // التفاعلات (Emoji)
    socket.on("reaction", (emoji) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            io.to(roomId).emit("reaction", { emoji, userId: socket.id });
        }
    });

    // عند الخروج
    socket.on("disconnect", () => {
        const roomId = socket.userData?.roomId;
        if (rooms[roomId]) {
            // حذف المستخدم من القائمة
            rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
            io.to(roomId).emit("update-users", rooms[roomId].users);
            
            // تنظيف خريطة الربط الصوتية
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