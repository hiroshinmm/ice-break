require('dotenv').config();

module.exports = {
    // Weekly execution: fetch news from the last 7 days
    DAYS_TO_FETCH: 7,

    // Gemini API configuration
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    // User requested models: 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'
    GEMINI_MODEL: 'gemini-3.1-flash-lite-preview',

    feeds: {
        "AI": [
            "https://news.google.com/rss/search?q=AI+OR+%E4%BA%BA%E5%B7%A5%E7%9F%A5%E8%83%BD+when:7d&hl=ja&gl=JP&ceid=JP:ja",
            "https://news.google.com/rss/search?q=AI+OR+%22Artificial+Intelligence%22+when:7d&hl=en-US&gl=US&ceid=US:en"
        ],
        "SRD / XR": [
            "https://uploadvr.com/feed/",
            "https://www.moguravr.com/feed/",
            "https://news.google.com/rss/search?q=XR+OR+VR+OR+AR+OR+MR+when:7d&hl=ja&gl=JP&ceid=JP:ja",
            "https://news.google.com/rss/search?q=%22Spatial+Reality+Display%22+when:7d&hl=en-US&gl=US&ceid=US:en"
        ],
        "Gaming Monitor": [
            "https://www.4gamer.net/rss/index.xml",
            "https://pc.watch.impress.co.jp/data/rss/1.0/pcw/feed.rdf",
            "https://news.google.com/rss/search?q=%22Gaming+Monitor%22+when:7d&hl=en-US&gl=US&ceid=US:en",
            "https://news.google.com/rss/search?q=%22OLED%22+AND+%22Monitor%22+when:7d&hl=en-US&gl=US&ceid=US:en"
        ],
        "Production Monitor": [
            "https://www.newsshooter.com/feed/",
            "https://www.cined.com/feed/",
            "https://www.pronews.jp/feed",
            "https://www.provideocoalition.com/feed/"
        ],
        "Camera Control": [
            "https://www.sonyalpharumors.com/feed/",
            "https://petapixel.com/feed/",
            "https://www.dpreview.com/feeds/news.xml",
            "https://dc.watch.impress.co.jp/data/rss/1.0/dcw/feed.rdf"
        ],
        "Projector": [
            "https://av.watch.impress.co.jp/data/rss/1.0/avw/feed.rdf",
            "https://www.audioholics.com/feed",
            "https://news.google.com/rss/search?q=%22Projector%22+AND+(%22Home+Theater%22+OR+%22Laser%22+OR+%224K%22)+when:7d&hl=en-US&gl=US&ceid=US:en",
            "https://news.google.com/rss/search?q=%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%82%BF%E3%83%BC+AND+(4K+OR+%E3%83%AC%E3%83%BC%E3%82%B6%E3%83%BC+OR+%E3%83%9B%E3%83%BC%E3%83%A0%E3%82%B7%E3%82%A2%E3%82%BF%E3%83%BC)+when:7d&hl=ja&gl=JP&ceid=JP:ja"
        ],
        "LED Wall Display": [
            "https://www.ravepubs.com/feed/",
            "https://www.digitalsignagetoday.com/rss/",
            "https://www.ledinside.com/rss.xml",
            "https://news.google.com/rss/search?q=%22LED+Wall%22+OR+%22MicroLED+display%22+when:7d&hl=en-US&gl=US&ceid=US:en"
        ],
        "SONY": [
            "https://news.google.com/rss/search?q=Sony+AND+(Display+OR+Monitor+OR+Camera+OR+XR)+when:7d&hl=en-US&gl=US&ceid=US:en",
            "https://news.google.com/rss/search?q=%E3%82%BD%E3%83%8B%E3%83%BC+AND+(%E3%83%87%E3%82%A3%E3%82%B9%E3%83%97%E3%83%AC%E3%82%A4+OR+%E3%83%A2%E3%83%8B%E3%82%BF%E3%83%BC+OR+%E3%82%AB%E3%83%A1%E3%83%A9+OR+XR)+when:7d&hl=ja&gl=JP&ceid=JP:ja"
        ],
        "TCL": [
            "https://news.google.com/rss/search?q=TCL+AND+(Display+OR+Monitor+OR+TV+OR+MiniLED)+when:7d&hl=en-US&gl=US&ceid=US:en",
            "https://news.google.com/rss/search?q=%22CSOT%22+OR+%22China+Star+Optoelectronics+Technology%22+when:7d&hl=en-US&gl=US&ceid=US:en",
            "https://news.google.com/rss/search?q=TCL+AND+(%E3%83%86%E3%83%AC%E3%83%93+OR+%E3%83%87%E3%82%A3%E3%82%B9%E3%83%97%E3%83%AC%E3%82%A4+OR+%E3%83%A2%E3%83%8B%E3%82%BF%E3%83%BC)+when:7d&hl=ja&gl=JP&ceid=JP:ja"
        ]
    }
};
