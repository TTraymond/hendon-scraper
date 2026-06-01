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
        let fullName = $('h1').first().text().trim();

        if (!fullName) {
            throw new Error("Impossible de lire le nom du joueur.");
        }

        // Nettoyage intelligent du nom (pour enlever le drapeau ou le pays collé au début comme "France ")
        const countries = ["France", "Spain", "Espagne", "United States", "USA", "Canada", "Germany", "Allemagne", "United Kingdom", "UK", "Italy", "Italie", "Belgium", "Belgique", "Switzerland", "Suisse", "Morocco", "Maroc", "Portugal", "Austria", "Autriche", "Brazil", "Brésil", "Argentina", "Argentine", "Ireland", "Irlande"];
        for (const country of countries) {
            const regex = new RegExp(`^${country}\\s+`, 'i');
            fullName = fullName.replace(regex, '');
        }

        // EXTRACTION PAR REGEX SUR LE TEXTE BRUT (Infaillible face aux changements de design CSS)
        const plainText = $('body').text();
        
        let totalWinnings = "";
        let bestCash = "";

        const totalWinningsMatch = plainText.match(/Total Live Earnings\s*[:\-]*\s*\$?\s*([0-9,.]+)/i);
        if (totalWinningsMatch && totalWinningsMatch[1]) {
            totalWinnings = totalWinningsMatch[1].trim();
        }

        const bestCashMatch = plainText.match(/Best Live Cash\s*[:\-]*\s*\$?\s*([0-9,.]+)/i);
        if (bestCashMatch && bestCashMatch[1]) {
            bestCash = bestCashMatch[1].trim();
        }

        // RECHERCHE DU VOLUME D'ITM INFALLIBLE :
        let volume = 0;
        
        $('a, span, li').each((i, el) => {
            const text = $(el).text().trim();
            if (text.startsWith("Results (") || text.match(/^Results\s*\((\d+)\)$/i)) {
                const match = text.match(/Results\s*\((\d+)\)/i);
                if (match && match[1]) {
                    volume = parseInt(match[1]);
                    return false;
                }
            }
        });

        if (volume === 0) {
            volume = $('.results tbody tr').length || $('.results tr').length || 0;
        }

        const cleanNumber = (str) => parseInt(str.replace(/[^0-9]/g, '')) || 0;

        const winningsNum = cleanNumber(totalWinnings);
        const bestCashNum = cleanNumber(bestCash);

        const data = {
            name: fullName,
            totalWinnings: winningsNum,
            bestCash: bestCashNum,
            volume: volume,
            abi: volume > 0 ? Math.round(winningsNum / volume) : 250
        };

        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: "Erreur lors de l'extraction. " + error.message });
    }
};
