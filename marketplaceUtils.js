const MarketplaceUtils = {
    // Keepa domain mappings (domain parameter in Keepa API)
    KEEPA_DOMAINS: {
      'amazon.com': 1,    // US
      'amazon.co.uk': 2,  // UK
      'amazon.de': 3,     // Germany
      'amazon.fr': 4,     // France
      'amazon.co.jp': 5,  // Japan
      'amazon.ca': 6,     // Canada
      'amazon.it': 8,     // Italy
      'amazon.es': 9,     // Spain
      'amazon.in': 10,    // India
      'amazon.com.br': 11, // Brazil
      'amazon.com.mx': 12, // Mexico
      'amazon.com.au': 13, // Australia
      'amazon.nl': 14,    // Netherlands
      'amazon.tr': 15,    // Turkey
      'amazon.ae': 16,    // UAE
      'amazon.pl': 17,    // Poland
      'amazon.se': 18,    // Sweden
      'amazon.sg': 19,    // Singapore
      'amazon.sa': 20,    // Saudi Arabia
      'amazon.be': 21     // Belgium
    },
  
    // Currency symbols and formatting
    CURRENCY_CONFIG: {
      'amazon.com': { symbol: '$', position: 'prefix', locale: 'en-US' },
      'amazon.co.uk': { symbol: '£', position: 'prefix', locale: 'en-GB' },
      'amazon.de': { symbol: '€', position: 'suffix', locale: 'de-DE' },
      'amazon.fr': { symbol: '€', position: 'suffix', locale: 'fr-FR' },
      'amazon.co.jp': { symbol: '¥', position: 'prefix', locale: 'ja-JP' },
      'amazon.ca': { symbol: '$', position: 'prefix', locale: 'en-CA' },
      'amazon.it': { symbol: '€', position: 'suffix', locale: 'it-IT' },
      'amazon.es': { symbol: '€', position: 'suffix', locale: 'es-ES' },
      'amazon.in': { symbol: '₹', position: 'prefix', locale: 'en-IN' },
      'amazon.com.br': { symbol: 'R$', position: 'prefix', locale: 'pt-BR' },
      'amazon.com.mx': { symbol: '$', position: 'prefix', locale: 'es-MX' },
      'amazon.com.au': { symbol: '$', position: 'prefix', locale: 'en-AU' },
      'amazon.nl': { symbol: '€', position: 'suffix', locale: 'nl-NL' },
      'amazon.tr': { symbol: '₺', position: 'suffix', locale: 'tr-TR' },
      'amazon.ae': { symbol: 'د.إ', position: 'suffix', locale: 'ar-AE' },
      'amazon.pl': { symbol: 'zł', position: 'suffix', locale: 'pl-PL' },
      'amazon.se': { symbol: 'kr', position: 'suffix', locale: 'sv-SE' },
      'amazon.sg': { symbol: '$', position: 'prefix', locale: 'en-SG' },
      'amazon.sa': { symbol: 'ر.س', position: 'suffix', locale: 'ar-SA' },
      'amazon.be': { symbol: '€', position: 'suffix', locale: 'nl-BE' }
    },
  
    getCurrentDomain: function() {
      const hostname = window.location.hostname.toLowerCase();
      return Object.keys(this.KEEPA_DOMAINS).find(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
    },
  
    getKeepaDomain: function(domain) {
      return this.KEEPA_DOMAINS[domain] || 1; // Default to US if not found
    },
  
    formatPrice: function(price, domain) {
      const config = this.CURRENCY_CONFIG[domain] || this.CURRENCY_CONFIG['amazon.com'];
      
      const formattedNumber = new Intl.NumberFormat(config.locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(price);
  
      return config.position === 'prefix' 
        ? `${config.symbol}${formattedNumber}`
        : `${formattedNumber} ${config.symbol}`;
    },
  
    standardizePrice: function(priceString, domain) {
      const config = this.CURRENCY_CONFIG[domain] || this.CURRENCY_CONFIG['amazon.com'];
      
      let cleanPrice = priceString.replace(config.symbol, '').trim();
      
      if (config.locale.includes('de') || config.locale.includes('fr')) {
        cleanPrice = cleanPrice.replace('.', '').replace(',', '.');
      } else {
        cleanPrice = cleanPrice.replace(',', '');
      }
      
      return parseFloat(cleanPrice);
    },
  
    getMarketplaceLanguage: function(domain) {
      const config = this.CURRENCY_CONFIG[domain] || this.CURRENCY_CONFIG['amazon.com'];
      return config.locale.split('-')[0];
    }
  };
  
  // Make it available globally
  window.MarketplaceUtils = MarketplaceUtils;