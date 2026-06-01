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

    // Ta clé ScraperAPI gratuite pour contourner définitivement Cloudflare :
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

        // Nettoyage intelligent du pays collé au nom par THM (ex: "France Jonathan Pastore")
        const countries = ["France", "Spain", "Espagne", "United States", "USA", "Canada", "Germany", "Allemagne", "United Kingdom", "UK", "Italy", "Italie", "Belgium", "Belgique", "Switzerland", "Suisse", "Morocco", "Maroc", "Portugal", "Austria", "Autriche", "Brazil", "Brésil", "Argentina", "Argentine", "Ireland", "Irlande"];
        for (const country of countries) {
            const regex = new RegExp(`^${country}\\s+`, 'i');
            fullName = fullName.replace(regex, '');
        }

        // EXTRACTION DES GAINS GLOBAUX PAR REGEX SUR LE TEXTE BRUT
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

        // EXTRACTION DU VOLUME GLOBAL D'ITM GLOBAUX
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

        // Fonction de conversion monétaire pour ramener tous les buy-ins en Euros (€)
        function convertBuyInToEur(eventText) {
            if (!eventText) return 0;
            
            // Regex pour repérer la devise et le montant principal (ex: "MAD 10,000 + 1,000" ou "€ 500 + 50")
            const regex = /(€|\$|£|r\$|sfr|chf|c\$|cad|a\$|aud|mad|aed|dh|dirham|kr|sek|nok|dkk)\s*([0-9,]+)/i;
            const match = eventText.match(regex);
            
            if (match) {
                const currency = match[1].toLowerCase();
                const value = parseInt(match[2].replace(/[^0-9]/g, '')) || 0;
                
                // Taux de change approximatifs moyens vers l'Euro (€)
                let rate = 1.0; 
                if (currency === '$' || currency === 'usd') rate = 0.92;
                else if (currency === '£' || currency === 'gbp') rate = 1.17;
                else if (currency === 'mad' || currency === 'dh' || currency === 'dirham') rate = 0.091; // 10000 MAD = 910 EUR
                else if (currency === 'aed') rate = 0.25; // Dubai Dirham
                else if (currency === 'sfr' || currency === 'chf') rate = 1.03;
                else if (currency === 'c$' || currency === 'cad') rate = 0.68;
                else if (currency === 'a$' || currency === 'aud') rate = 0.61;
                else if (currency === 'r$' || currency === 'brl') rate = 0.18;
                else if (currency === 'kr' || currency === 'sek' || currency === 'nok' || currency === 'dkk') rate = 0.09;
                
                return Math.round(value * rate);
            }
            
            // Fallback si pas de devise détectée mais un chiffre brut au départ
            const simpleMatch = eventText.match(/^\s*([0-9,]+)/);
            if (simpleMatch) {
                return parseInt(simpleMatch[1].replace(/[^0-9]/g, '')) || 0;
            }
            return 0;
        }

        // Parse l'historique complet (limité aux 100 derniers pour éviter de saturer la mémoire réseau)
        const tournaments = [];
        let totalBuyInForAbi = 0;
        let countWithBuyIn = 0;

        $('.results tbody tr, .results tr').each((i, el) => {
            const date = $(el).find('td').eq(0).text().trim() || "";
            const event = $(el).find('td').eq(2).text().trim() || "";
            const place = $(el).find('td').eq(3).text().trim() || "";
            const prize = $(el).find('td').eq(4).text().trim() || "";
            
            // On ne prend que les lignes valides de tournois
            if (date && event && place) {
                const buyInEur = convertBuyInToEur(event);
                
                if (buyInEur > 0) {
                    totalBuyInForAbi += buyInEur;
                    countWithBuyIn++;
                }

                if (tournaments.length < 100) {
                    tournaments.push({
                        date,
                        event,
                        place,
                        prize,
                        buyInEur: buyInEur || null
                    });
                }
            }
        });

        // Calcul de l'ABI réel basé sur la moyenne de ses buy-ins convertis
        let cleanAbi = 250;
        if (countWithBuyIn > 0) {
            cleanAbi = Math.round(totalBuyInForAbi / countWithBuyIn);
        } else {
            // Fallback si aucun buy-in n'est détecté
            const totalWinningsNum = parseInt(totalWinnings.replace(/[^0-9]/g, '')) || 0;
            if (volume > 0) {
                cleanAbi = Math.round((totalWinningsNum / volume) / 8); // Division par ratio de cash standard
            }
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
