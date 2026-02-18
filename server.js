const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// توجيه الملفات الثابتة (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// تخزين بيانات الغرف والمستخدمين
// الهيكل: { roomId: { users: [], agoraMap: {} } }
const rooms = {};

io.on('connection', (socket) => {
    console.log('مستخدم جديد متصل:', socket.id);

    // 1. الانضمام لغرفة
    socket.on('join-room', ({ roomId, password, user }) => {
        // إنشاء الغرفة إذا لم تكن موجودة
        if (!rooms[roomId]) {
            rooms[roomId] = {
                password: password,
                users: [],
                agoraMap: {} // لربط Agora UID بـ Socket ID
            };
        }

        // التحقق من كلمة المرور
        if (rooms[roomId].password !== password) {
            return socket.emit('error-msg', 'كلمة المرور غير صحيحة!');
        }

        // إضافة المستخدم للغرفة
        socket.join(roomId);
        const userData = { ...user, id: socket.id };
        rooms[roomId].users.push(userData);

        // حفظ بيانات الغرفة في الـ socket للرجوع إليها لاحقاً
        socket.roomId = roomId;

        // إرسال تأكيد الدخول وتحديث القائمة للجميع
        socket.emit('join-success');
        io.to(roomId).emit('update-users', rooms[roomId].users);
        io.to(roomId).emit('update-agora-map', rooms[roomId].agoraMap);
    });

    // 2. ربط معرف Agora (UID) بمعرف السوكيت (Socket ID)
    // هذا الجزء هو المسؤول عن جعل الأفاتار "يتوهج" عند الكلام
    socket.on('map-agora-id', ({ uid }) => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            rooms[roomId].agoraMap[uid] = socket.id;
            io.to(roomId).emit('update-agora-map', rooms[roomId].agoraMap);
        }
    });

    // 3. مزامنة الفيديو (تغيير الفيلم)
    socket.on('change-video', (url) => {
        const roomId = socket.roomId;
        if (roomId) {
            io.to(roomId).emit('video-changed', url);
        }
    });

    // 4. مزامنة التحكم (تشغيل/إيقاف/تقديم)
    socket.on('video-control', (data) => {
        const roomId = socket.roomId;
        if (roomId) {
            // نرسل التحكم للجميع ما عدا الشخص الذي أرسل الأمر لتجنب التعليق
            socket.to(roomId).emit('video-sync', data);
        }
    });

    // 5. الشات والتفاعلات
    socket.on('chat-msg', (text) => {
        const roomId = socket.roomId;
        const user = rooms[roomId]?.users.find(u => u.id === socket.id);
        if (roomId && user) {
            io.to(roomId).emit('chat-msg', { text, user });
        }
    });

    socket.on('reaction', (emoji) => {
        const roomId = socket.roomId;
        if (roomId) {
            io.to(roomId).emit('reaction', { emoji, id: socket.id });
        }
    });

    // 6. التعامل مع قطع الاتصال
    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            // إزالة المستخدم من القائمة
            rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
            
            // إزالة الربط الخاص بـ Agora
            for (let uid in rooms[roomId].agoraMap) {
                if (rooms[roomId].agoraMap[uid] === socket.id) {
                    delete rooms[roomId].agoraMap[uid];
                }
            }

            io.to(roomId).emit('update-users', rooms[roomId].users);
            io.to(roomId).emit('update-agora-map', rooms[roomId].agoraMap);

            // حذف الغرفة إذا أصبحت فارغة تماماً
            if (rooms[roomId].users.length === 0) {
                delete rooms[roomId];
            }
        }
        console.log('انقطع اتصال مستخدم:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل على الرابط: http://localhost:${PORT}`);
});