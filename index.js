require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const { WebhookClient, EmbedBuilder } = require('discord.js');
const path = require('path'); // Import path module

const app = express();
app.use(bodyParser.json());

// FIX 1: Use path.join to correctly find the folder on Linux
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = 'items.json';
const CHECK_INTERVAL_SECONDS = 60;

// Load items from file
let itemsToWatch = [];
try {
    itemsToWatch = JSON.parse(fs.readFileSync(DATA_FILE));
} catch (e) {
    itemsToWatch = [];
}

function saveItems() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(itemsToWatch, null, 2));
}

// --- API ENDPOINTS ---
app.get('/api/items', (req, res) => {
    res.json(itemsToWatch);
});

app.post('/api/items', (req, res) => {
    const newItem = req.body;
    if (!newItem.id || !newItem.maxPrice) {
        return res.status(400).send('Missing ID or Price');
    }
    itemsToWatch.push(newItem);
    saveItems();
    res.json({ success: true, items: itemsToWatch });
});

app.delete('/api/items/:id', (req, res) => {
    itemsToWatch = itemsToWatch.filter(i => i.id !== req.params.id);
    saveItems();
    res.json({ success: true, items: itemsToWatch });
});

// FIX 2: Explicitly serve index.html for the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ---------------------

// --- MONITORING LOGIC ---
const webhookClient = new WebhookClient({ url: process.env.DISCORD_WEBHOOK_URL });

async function fetchPrice(itemId) {
    try {
        const url = `https://buff.163.com/api/market/goods/sell_order?game=csgo&goods_id=${itemId}&page_num=1&sort_by=default&mode=&allow_tradable_cooldown=1&_=${Date.now()}`;
        const response = await axios.get(url, {
            headers: {
                'Cookie': process.env.BUFF_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (response.data.code === 'OK' && response.data.data.items.length > 0) {
            return parseFloat(response.data.data.items[0].price);
        }
    } catch (error) {
        console.error(`Error fetching ${itemId}:`, error.message);
    }
    return null;
}

async function monitor() {
    console.log('Starting Monitor Loop...');
    setInterval(async () => {
        for (const item of itemsToWatch) {
            const price = await fetchPrice(item.id);
            if (price && price <= item.maxPrice) {
                const embed = new EmbedBuilder()
                    .setTitle(`🚨 Price Alert: ${item.name}`)
                    .setColor(0x00FF00)
                    .setDescription(`**Price: ¥${price}** (Target: ¥${item.maxPrice})`)
                    .addFields({ name: 'Link', value: `[Buy Now](https://buff.163.com/goods/${item.id})` });
                
                await webhookClient.send({ embeds: [embed] });
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }, CHECK_INTERVAL_SECONDS * 1000);
}

monitor();

// FIX 3: Use process.env.PORT (Required for Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));