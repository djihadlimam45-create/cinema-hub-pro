const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
const rooms = {};

io.on("connection", (socket) => {
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
        
        if(rooms[roomId].currentVideo) {
            socket.emit("video-changed", rooms[roomId].currentVideo);
        }
    });

    // عندما يغير شخص الفيديو (رابط مباشر أو يوتيوب)
    socket.on("change-video", (url) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            rooms[roomId].currentVideo = url;
            // نرسل الرابط الجديد للجميع في الغرفة
            io.to(roomId).emit("video-changed", url);
        }
    });

    // التحكم الجماعي المتقدم (إرسال أوامر التشغيل والإيقاف والتوقيت)
    socket.on("video-control", (data) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            // "socket.to(roomId)" ترسل للجميع ما عدا الشخص الذي ضغط الزر
            // لضمان عدم حدوث تكرار للأمر عند المرسل
            socket.to(roomId).emit("video-sync", data);
        }
    });

    socket.on("chat-msg", (text) => {
        const roomId = socket.userData?.roomId;
        if (roomId) io.to(roomId).emit("chat-msg", { text, user: socket.userData });
    });

    socket.on("reaction", (emoji) => {
        const roomId = socket.userData?.roomId;
        if (roomId) io.to(roomId).emit("reaction", { emoji, userId: socket.id });
    });

    socket.on("disconnect", () => {
        const roomId = socket.userData?.roomId;
        if (rooms[roomId]) {
            rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
            io.to(roomId).emit("update-users", rooms[roomId].users);
        }
    });
});

server.listen(3000, () => console.log("🚀 السيرفر يعمل وجاهز للمزامنة على: http://localhost:3000"));