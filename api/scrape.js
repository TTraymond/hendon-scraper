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

    // Ta clé ScraperAPI gratuite
    const SCRAPER_API_KEY = "2e937a0c0fb45a2a87bc5e3b7a6aed0b"; 

    try {
        let htmlData = "";

        if (SCRAPER_API_KEY) {
            const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`;
            const response = await axios.get(proxyUrl);
            htmlData = response.data;
        } else {
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            htmlData = response.data;
        }

        const $ = cheerio.load(htmlData);
        let fullName = $('h1').first().text().trim();

        // Nettoyage intelligent du pays collé au nom
        const countries = ["France", "Spain", "Espagne", "United States", "USA", "Canada", "Germany", "Allemagne", "United Kingdom", "UK", "Italy", "Italie", "Belgium", "Belgique", "Switzerland", "Suisse", "Morocco", "Maroc", "Portugal", "Austria", "Autriche", "Brazil", "Brésil", "Argentina", "Argentine", "Ireland", "Irlande"];
        for (const country of countries) {
            const regex = new RegExp(`^${country}\\s+`, 'i');
            fullName = fullName.replace(regex, '');
        }

        // EXTRACTION DES GAINS GLOBAUX
        const plainText = $('body').text();
        let totalWinnings = "";
        let bestCash = "";

        const totalWinningsMatch = plainText.match(/Total Live Earnings\s*[:\-]*\s*\$?\s*([0-9,.]+)/i);
        if (totalWinningsMatch && totalWinningsMatch[1]) totalWinnings = totalWinningsMatch[1].trim();

        const bestCashMatch = plainText.match(/Best Live Cash\s*[:\-]*\s*\$?\s*([0-9,.]+)/i);
        if (bestCashMatch && bestCashMatch[1]) bestCash = bestCashMatch[1].trim();

        // VOLUME
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

        // Fonction de conversion monétaire vers l'Euro
        function convertBuyInToEur(eventText) {
            if (!eventText) return 0;
            const regex = /(€|\$|£|r\$|sfr|chf|c\$|cad|a\$|aud|mad|aed|dh|dirham|kr|sek|nok|dkk)\s*([0-9,]+)/i;
            const match = eventText.match(regex);
            
            if (match) {
                const currency = match[1].toLowerCase();
                const value = parseInt(match[2].replace(/[^0-9]/g, '')) || 0;
                
                let rate = 1.0; 
                if (currency === '$' || currency === 'usd') rate = 0.92;
                else if (currency === '£' || currency === 'gbp') rate = 1.17;
                else if (currency === 'mad' || currency === 'dh' || currency === 'dirham') rate = 0.091;
                else if (currency === 'aed') rate = 0.25;
                else if (currency === 'sfr' || currency === 'chf') rate = 1.03;
                else if (currency === 'c$' || currency === 'cad') rate = 0.68;
                else if (currency === 'a$' || currency === 'aud') rate = 0.61;
                else if (currency === 'r$' || currency === 'brl') rate = 0.18;
                else if (['kr', 'sek', 'nok', 'dkk'].includes(currency)) rate = 0.09;
                
                return Math.round(value * rate);
            }
            return 0;
        }

        // ASPIRATION AGRESSIVE DE L'HISTORIQUE DES TOURNOIS
        const tournaments = [];
        let totalBuyInForAbi = 0;
        let countWithBuyIn = 0;

        // On scanne absolument toutes les lignes de tous les tableaux
        $('table tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            
            // Un résultat Hendon Mob a au moins 5 colonnes (Date, Pays, Event, Place, Gain)
            if (tds.length >= 5) {
                const date = tds.eq(0).text().trim();
                const event = tds.eq(2).text().trim();
                const place = tds.eq(3).text().trim();
                const prize = tds.eq(4).text().trim();
                
                // On vérifie que la place contient bien un chiffre (pour exclure les en-têtes)
                if (date && event && place && /\d/.test(place)) {
                    const buyInEur = convertBuyInToEur(event);
                    
                    if (buyInEur > 0) {
                        totalBuyInForAbi += buyInEur;
                        countWithBuyIn++;
                    }

                    if (tournaments.length < 100) {
                        tournaments.push({ date, event, place, prize, buyInEur });
                    }
                }
            }
        });

        // Sécurité sur le volume si l'onglet n'a pas été trouvé
        if (volume === 0) volume = tournaments.length;

        // Calcul de l'ABI
        let cleanAbi = 250;
        if (countWithBuyIn > 0) {
            cleanAbi = Math.round(totalBuyInForAbi / countWithBuyIn);
        } else {
            const totalWinningsNum = parseInt(totalWinnings.replace(/[^0-9]/g, '')) || 0;
            if (volume > 0) cleanAbi = Math.round((totalWinningsNum / volume) / 8); 
        }

        const cleanNumber = (str) => parseInt(str.replace(/[^0-9]/g, '')) || 0;

        res.status(200).json({
            name: fullName,
            totalWinnings: cleanNumber(totalWinnings),
            bestCash: cleanNumber(bestCash),
            volume: volume,
            abi: cleanAbi,
            tournaments: tournaments
        });

    } catch (error) {
        res.status(500).json({ error: "Erreur lors de l'extraction. " + error.message });
    }
};
