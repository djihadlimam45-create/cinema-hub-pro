const socket = io();
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const TMDB_KEY = "4a71b39887f9b5dd489791402728ab1a";
const APP_ID = "97b6d211d09447b480ae3b8b62cc4a68";
const CHANNEL = "main_room";

let localAudioTrack = null;
let isMicOn = false;
let currentUser = { name: "", avatar: "" };
let agoraToSocketMap = {};
const videoElement = document.getElementById('video');

// --- نظام الأفاتارات ---
function init() {
    const presets = document.getElementById('avatar-presets');
    for(let i=1; i<=5; i++) {
        const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${i+33}`;
        const img = document.createElement('img');
        img.src = url;
        img.onclick = () => { 
            document.getElementById('preview').src = url; 
            currentUser.avatar = url; 
        };
        presets.appendChild(img);
    }
}
init();

function join() {
    const name = document.getElementById('username').value;
    const room = document.getElementById('room-id').value;
    const pass = document.getElementById('room-pass').value;
    if(!name || !room) return alert("أكمل البيانات!");
    currentUser.name = name;
    currentUser.avatar = currentUser.avatar || document.getElementById('preview').src;
    socket.emit("join-room", { roomId: room, password: pass, user: currentUser });
}

socket.on("join-success", () => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
});

socket.on("update-users", users => {
    const userList = document.getElementById('user-list');
    userList.innerHTML = "";
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'avatar-container';
        div.id = `user-${user.id}`;
        div.innerHTML = `<img src="${user.avatar}" class="avatar-img"><div class="user-name">${user.name}</div>`;
        userList.appendChild(div);
    });
});

socket.on("update-agora-map", map => agoraToSocketMap = map);

// --- نظام الصوت ---
client.enableAudioVolumeIndicator();
client.on("volume-indicator", volumes => {
    volumes.forEach((volume) => {
        const socketId = agoraToSocketMap[volume.uid] || (volume.uid === client.uid ? socket.id : null);
        const el = document.getElementById(`user-${socketId}`);
        if (el) {
            if (volume.level > 40) el.classList.add('speaking');
            else el.classList.remove('speaking');
        }
    });
});

client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "audio") user.audioTrack.play();
});

async function toggleMic() {
    if (!localAudioTrack) {
        const uid = await client.join(APP_ID, CHANNEL, null, null);
        socket.emit("map-agora-id", { uid: uid });
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await client.publish(localAudioTrack);
    }
    isMicOn = !isMicOn;
    await localAudioTrack.setEnabled(isMicOn);
    document.getElementById('mic-btn').innerHTML = isMicOn ? "🎤" : "🔇";
}

// --- نظام الأفلام ---
document.getElementById('movieSearch').oninput = async (e) => {
    const query = e.target.value;
    if(query.length < 3) return;
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&language=ar-SA`);
    const data = await res.json();
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = "";
    data.results.slice(0,6).forEach(m => {
        const div = document.createElement('div');
        div.className = "search-item";
        div.innerHTML = `<span>${m.title || m.name}</span>`;
        div.onclick = () => {
            const url = `https://vidsrc.me/embed/${m.media_type === 'movie' ? 'movie' : 'tv'}?tmdb=${m.id}`;
            socket.emit("change-video", url);
            resDiv.style.display = "none";
        };
        resDiv.appendChild(div);
    });
    resDiv.style.display = "block";
};

socket.on("video-changed", url => {
    const iframeSlot = document.getElementById('iframe-slot');
    iframeSlot.innerHTML = `<iframe src="${url}" allowfullscreen allow="autoplay" style="width:100%; height:100%; border:none;"></iframe>`;
});

// --- الشات ---
socket.on("chat-msg", d => {
    const msg = document.getElementById('messages');
    msg.innerHTML += `<div><b>${d.user.name}:</b> ${d.text}</div>`;
    msg.scrollTop = msg.scrollHeight;
});

document.getElementById('chatInput').onkeypress = (e) => {
    if(e.key === "Enter" && e.target.value !== "") {
        socket.emit("chat-msg", e.target.value); 
        e.target.value = "";
    }
};