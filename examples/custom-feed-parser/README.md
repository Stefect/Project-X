# Custom Feed Parser Example

Learn how to create and integrate custom news feed parsers in BrowserX.

## Overview

BrowserX's AI Feed system is extensible - you can add your own feed parsers for any RSS/JSON/API source.

## Basic Feed Parser

```javascript
// custom-feed-parser.js

class CustomFeedParser {
  constructor(name, url, type) {
    this.name = name;
    this.url = url;
    this.type = type;
  }
  
  async fetch() {
    try {
      const response = await fetch(this.url);
      const data = await response.json();
      
      return this.parse(data);
    } catch (error) {
      console.error(`[${this.name}] Fetch error:`, error);
      return [];
    }
  }
  
  parse(data) {
    // Override in subclass
    return [];
  }
}

// Example: Reddit Parser
class RedditParser extends CustomFeedParser {
  parse(data) {
    return data.data.children.map(child => {
      const post = child.data;
      return {
        title: post.title,
        description: post.selftext || '',
        link: `https://reddit.com${post.permalink}`,
        source: this.name,
        timestamp: post.created_utc * 1000,
        author: post.author,
        score: post.score,
        comments: post.num_comments
      };
    });
  }
}

// Example: Dev.to Parser
class DevToParser extends CustomFeedParser {
  parse(data) {
    return data.map(article => ({
      title: article.title,
      description: article.description,
      link: article.url,
      source: this.name,
      timestamp: new Date(article.published_at).getTime(),
      author: article.user.name,
      tags: article.tag_list
    }));
  }
}

// Example: Hacker News Parser
class HackerNewsParser extends CustomFeedParser {
  async fetch() {
    try {
      // Fetch story IDs
      const response = await fetch(this.url);
      const storyIds = await response.json();
      
      // Fetch first 10 stories
      const stories = await Promise.all(
        storyIds.slice(0, 10).map(id =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
            .then(r => r.json())
        )
      );
      
      return this.parse(stories);
    } catch (error) {
      console.error(`[${this.name}] Fetch error:`, error);
      return [];
    }
  }
  
  parse(stories) {
    return stories.map(story => ({
      title: story.title,
      description: story.text || '',
      link: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      source: this.name,
      timestamp: story.time * 1000,
      author: story.by,
      score: story.score
    }));
  }
}

// Usage
const parsers = [
  new RedditParser('Reddit Tech', 'https://www.reddit.com/r/technology/new.json?limit=10'),
  new DevToParser('Dev.to', 'https://dev.to/api/articles?per_page=10'),
  new HackerNewsParser('Hacker News', 'https://hacker-news.firebaseio.com/v0/newstories.json')
];

// Fetch from all sources
async function fetchAllNews() {
  const results = await Promise.all(parsers.map(p => p.fetch()));
  const articles = results.flat();
  
  // Sort by timestamp
  articles.sort((a, b) => b.timestamp - a.timestamp);
  
  return articles;
}

// Display
fetchAllNews().then(articles => {
  console.log(`Fetched ${articles.length} articles`);
  articles.forEach(article => {
    console.log(`${article.source}: ${article.title}`);
  });
});
```

---

## Integration with BrowserX

### Method 1: Add to ai-feed.js

Edit `src/modules/ai-feed.js`:

```javascript
// Add your custom source to NEWS_SOURCES array
const NEWS_SOURCES = [
  // ... existing sources
  
  // Your custom source
  { 
    name: 'My Custom Feed', 
    url: 'https://api.mycustomfeed.com/articles',
    type: 'custom',
    categories: ['tech', 'all']
  }
];

// Add parser for your type
async function fetchFromCustom(source) {
  const response = await fetch(source.url);
  const data = await response.json();
  
  return data.items.map(item => ({
    title: item.headline,
    description: item.summary,
    link: item.url,
    source: source.name,
    timestamp: new Date(item.publishedDate).getTime()
  }));
}

// Add to switch statement in fetchFromSource function
case 'custom':
  return await fetchFromCustom(source);
```

### Method 2: User-Added Sources

Allow users to add custom feeds via UI:

```javascript
// In settings.html
function addCustomSource() {
  const name = prompt('Source name:');
  const url = prompt('Feed URL (RSS/JSON):');
  const type = prompt('Type (rss/json):');
  
  if (!name || !url || !type) return;
  
  const customSources = JSON.parse(localStorage.getItem('customNewsSources') || '[]');
  
  customSources.push({
    name: name,
    url: url,
    type: type,
    categories: ['all']
  });
  
  localStorage.setItem('customNewsSources', JSON.stringify(customSources));
  
  alert('Custom source added! Restart feed to see updates.');
}
```

---

## RSS Feed Parser

Parse any RSS feed:

```javascript
// rss-parser-example.js

const Parser = require('rss-parser');
const parser = new Parser({
  headers: {
    'User-Agent': 'BrowserX/2.0',
    'Accept': 'application/rss+xml'
  }
});

async function parseRSSFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    
    console.log('Feed Info:');
    console.log('Title:', feed.title);
    console.log('Description:', feed.description);
    console.log('Link:', feed.link);
    
    const articles = feed.items.map(item => ({
      title: item.title,
      description: item.contentSnippet || item.content || '',
      link: item.link,
      source: feed.title,
      timestamp: new Date(item.pubDate || item.isoDate).getTime(),
      author: item.creator || item.author
    }));
    
    return articles;
  } catch (error) {
    console.error('RSS parsing error:', error);
    return [];
  }
}

// Popular RSS Feeds
const popularFeeds = [
  'https://feeds.bbci.co.uk/news/rss.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  'https://www.theguardian.com/world/rss',
  'https://feeds.arstechnica.com/arstechnica/index',
  'https://www.wired.com/feed/rss'
];

// Fetch from all RSS feeds
async function fetchAllRSS() {
  const results = await Promise.all(
    popularFeeds.map(url => parseRSSFeed(url))
  );
  
  return results.flat();
}
```

---

## Testing Your Parser

```javascript
// Test script
async function testParser() {
  console.log('Testing custom feed parser...');
  
  const parser = new RedditParser('Test Reddit', 'https://www.reddit.com/r/technology/new.json?limit=5');
  
  const articles = await parser.fetch();
  
  console.log(`✓ Fetched ${articles.length} articles`);
  
  // Validate structure
  const requiredFields = ['title', 'link', 'source', 'timestamp'];
  const valid = articles.every(article => 
    requiredFields.every(field => field in article)
  );
  
  console.log(`✓ Structure valid: ${valid}`);
  
  // Display sample
  if (articles.length > 0) {
    console.log('Sample article:', articles[0]);
  }
  
  console.log('✅ Test passed!');
}

testParser();
```

---

## API Examples

### GitHub API

```javascript
class GitHubParser extends CustomFeedParser {
  async fetch() {
    const response = await fetch('https://api.github.com/repos/trending/daily');
    const repos = await response.json();
    
    return repos.map(repo => ({
      title: repo.name,
      description: repo.description,
      link: repo.html_url,
      source: 'GitHub Trending',
      timestamp: new Date(repo.created_at).getTime(),
      stars: repo.stargazers_count
    }));
  }
}
```

### Medium API

```javascript
class MediumParser extends CustomFeedParser {
  async fetch() {
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/tag/${this.tag}`);
    const data = await response.json();
    
    return data.items.map(item => ({
      title: item.title,
      description: item.description,
      link: item.link,
      source: 'Medium',
      timestamp: new Date(item.pubDate).getTime(),
      author: item.author
    }));
  }
}
```

## License

MIT
