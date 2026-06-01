// api/scrape.js
const axios = require('axios');
const cheerio = require('cheerio');

// Fonction "Serverless" exigée par Vercel
module.exports = async (req, res) => {
    // Autoriser ton application HTML à appeler cette API (CORS)
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

    try {
        // On se fait passer pour un vrai navigateur web pour ne pas être bloqué
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // 1. Extraire le NOM (en cherchant la balise H1)
        const fullName = $('h1').first().text().trim();

        // 2. Extraire les Stats globales (le tableau en haut à droite sur HM)
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

        // 3. Compter le volume (Nombre de lignes de résultats = ITM)
        const volume = $('.results-table tbody tr').length;

        // Nettoyage des montants (enlever les $, les espaces, les virgules)
        const cleanNumber = (str) => parseInt(str.replace(/[^0-9]/g, '')) || 0;

        const data = {
            name: fullName,
            totalWinnings: cleanNumber(totalWinnings),
            bestCash: cleanNumber(bestCash),
            volume: volume,
            // abi est difficile à extraire d'un coup car il faut convertir toutes les devises. 
            // On met une valeur par défaut ou on calcule un ABI brut basé sur les gains
            abi: 500 // Placeholder pour l'instant
        };

        // Renvoie le résultat propre !
        res.status(200).json(data);

    } catch (error) {
        console.error("Erreur de scraping:", error.message);
        res.status(500).json({ error: "Erreur lors de l'extraction des données." });
    }
};
