const MarketplaceUtils = {
    getCurrentDomain: function() {
        const hostname = window.location.hostname.toLowerCase();
        const validDomains = [
            'amazon.com',
            'amazon.co.uk',
            'amazon.de',
            'amazon.fr',
            'amazon.co.jp',
            'amazon.ca',
            'amazon.it',
            'amazon.es',
            'amazon.in',
            'amazon.com.br',
            'amazon.com.mx',
            'amazon.com.au',
            'amazon.nl',
            'amazon.tr',
            'amazon.ae',
            'amazon.pl',
            'amazon.se',
            'amazon.sg',
            'amazon.sa',
            'amazon.be'
        ];
        
        return validDomains.find(domain => 
            hostname === domain || hostname.endsWith('.' + domain)
        );
    }
};

window.MarketplaceUtils = MarketplaceUtils;