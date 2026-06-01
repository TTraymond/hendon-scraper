const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // Configuration des accès CORS pour que ton application mobile puisse lire le serveur
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

    // COLLER TA CLE SCRAPERAPI GRATUITE ENTRE LES GUILLEMETS CI-DESSOUS :
    const SCRAPER_API_KEY = "REMPLACE_PAR_TA_CLE_SCRAPER_API"; 

    try {
        let htmlData = "";

        if (SCRAPER_API_KEY && SCRAPER_API_KEY !== "REMPLACE_PAR_TA_CLE_SCRAPER_API") {
            // OPTION A (Recommandée) : On passe par le tunnel ScraperAPI indétectable par Cloudflare
            const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`;
            const response = await axios.get(proxyUrl);
            htmlData = response.data;
        } else {
            // OPTION B (Secours) : Requête directe (Risque fort de blocage Cloudflare)
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            htmlData = response.data;
        }

        const $ = cheerio.load(htmlData);

        // 1. Extraction du nom complet
        const fullName = $('h1').first().text().trim();

        if (!fullName) {
            throw new Error("Impossible de lire le nom du joueur (bloqué par Cloudflare ou structure modifiée).");
        }

        // 2. Extraction des statistiques dans le tableau d'en-tête
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

        // 3. Calcul du volume (nombre de lignes de résultats de places payées ITM)
        const volume = $('.results-table tbody tr').length;

        // Fonction de nettoyage pour extraire uniquement les nombres des montants $
        const cleanNumber = (str) => parseInt(str.replace(/[^0-9]/g, '')) || 0;

        const data = {
            name: fullName,
            totalWinnings: cleanNumber(totalWinnings),
            bestCash: cleanNumber(bestCash),
            volume: volume,
            abi: volume > 0 ? Math.round(cleanNumber(totalWinnings) / volume) : 250 // ABI brut estimé par défaut
        };

        // Envoi des données propres au client
        res.status(200).json(data);

    } catch (error) {
        console.error("Erreur de scraping:", error.message);
        res.status(500).json({ error: "Erreur lors de l'extraction des données. " + error.message });
    }
};
