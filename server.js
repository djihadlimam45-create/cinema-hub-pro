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
    socket.on("join-room", ({ roomId, password, user }) => {
        if (rooms[roomId] && rooms[roomId].password !== password) {
            return socket.emit("error-msg", "كلمة المرور خاطئة!");
        }

        socket.join(roomId);
        socket.userData = { ...user, roomId, id: socket.id };

        if (!rooms[roomId]) {
            // أول شخص يدخل يصبح هو الـ Host
            rooms[roomId] = { 
                password: password, 
                users: [], 
                host: socket.id,
                currentVideo: "" 
            };
        }

        rooms[roomId].users.push(socket.userData);
        
        // إرسال حالة الـ Host للمستخدم المنضم
        socket.emit("join-success", { isHost: rooms[roomId].host === socket.id });
        
        io.to(roomId).emit("update-users", rooms[roomId].users);
        socket.emit("update-agora-map", agoraMap);

        if(rooms[roomId].currentVideo) {
            socket.emit("video-changed", rooms[roomId].currentVideo);
        }
    });

    // التحكم بالفيديو (للآدمن فقط)
    socket.on("change-video", (url) => {
        const roomId = socket.userData?.roomId;
        if (roomId && rooms[roomId].host === socket.id) {
            rooms[roomId].currentVideo = url;
            io.to(roomId).emit("video-changed", url);
        }
    });

    socket.on("video-control", (data) => {
        const roomId = socket.userData?.roomId;
        if (roomId && rooms[roomId].host === socket.id) {
            socket.to(roomId).emit("video-sync", data);
        }
    });

    socket.on("map-agora-id", ({ uid }) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            agoraMap[uid] = socket.id;
            io.to(roomId).emit("update-agora-map", agoraMap);
        }
    });

    socket.on("chat-msg", (text) => {
        const roomId = socket.userData?.roomId;
        if (roomId) io.to(roomId).emit("chat-msg", { text, user: socket.userData });
    });

    socket.on("disconnect", () => {
        const roomId = socket.userData?.roomId;
        if (rooms[roomId]) {
            rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
            // إذا غادر الآدمن، انقل الملكية للشخص التالي
            if (rooms[roomId].host === socket.id && rooms[roomId].users.length > 0) {
                rooms[roomId].host = rooms[roomId].users[0].id;
                io.to(rooms[roomId].host).emit("host-update", true);
            }
            io.to(roomId).emit("update-users", rooms[roomId].users);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Cinema Master on port ${PORT}`));