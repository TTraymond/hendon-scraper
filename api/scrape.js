const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { url } = req.query;

    if (!url || !url.includes('hendonmob.com')) {
        return res.status(400).json({ error: "Veuillez fournir une URL Hendon Mob valide." });
    }

    // Ta clé de contournement ScraperAPI activée :
    const SCRAPER_API_KEY = "2e937a0c0fb45a2a87bc5e3b7a6aed0b"; 

    try {
        let htmlData = "";

        if (SCRAPER_API_KEY) {
            const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`;
            const response = await axios.get(proxyUrl);
            htmlData = response.data;
        } else {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            htmlData = response.data;
        }

        const $ = cheerio.load(htmlData);
        const fullName = $('h1').first().text().trim();

        if (!fullName) {
            throw new Error("Impossible de lire le nom du joueur.");
        }

        let totalWinnings = "";
        let bestCash = "";
        
        $('.player-profile-info-table tr').each((i, el) => {
            const text = $(el).text();
            if (text.includes('Total Live Earnings')) {
                totalWinnings = $(el).find('td').eq(1).text().trim();
            }
            if (text.includes('Best Live Cash')) {
                bestCash = $(el).find('td').eq(1).text().trim();
            }
        });

        const volume = $('.results-table tbody tr').length;
        const cleanNumber = (str) => parseInt(str.replace(/[^0-9]/g, '')) || 0;

        const data = {
            name: fullName,
            totalWinnings: cleanNumber(totalWinnings),
            bestCash: cleanNumber(bestCash),
            volume: volume,
            abi: volume > 0 ? Math.round(cleanNumber(totalWinnings) / volume) : 250
        };

        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: "Erreur lors de l'extraction. " + error.message });
    }
};
