import type { APIRoute } from 'astro';

const BUCKET_NAME = 'autopot1-printdump';
const FOLDER_PREFIX = 'completed_works/';
const BUCKET_API_URL = `https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}/o`;

interface GCSItem {
  name: string;
  bucket: string;
  contentType?: string;
  size?: string;
  timeCreated?: string;
  updated?: string;
}

interface GCSResponse {
  items?: GCSItem[];
  prefixes?: string[];
}

// Product dictionary: friendly name, regex pattern, and pricing
const PRODUCTS: Array<{
  friendlyName: string;
  regex: RegExp;
  getPrice: (id: number) => { price: string; status?: 'sold' | 'inquire' | 'not-priced'; pairPrice?: string };
}> = [

    // Sold items
  {
    friendlyName: 'Tumbly Tumbler',
    regex: /\bTT(\d+)/i,
    getPrice: () => ({ price: 'Sold', status: 'sold' }),
  },
  {
    friendlyName: 'Martini Tumbler',
    regex: /\bTM(15|01|02)\b/i,
    getPrice: () => ({ price: 'Sold', status: 'sold' }),
  },
  {
    friendlyName: 'Random Vase',
    regex: /\bRV(0?4)\b/i,
    getPrice: () => ({ price: 'Sold', status: 'sold' }),
  },
  {
    friendlyName: 'Summer Vase',
    regex: /\bSV(05|14|23)\b/i,
    getPrice: () => ({ price: 'Sold', status: 'sold' }),
  },

  // Inquire items
  {
    friendlyName: 'Summer Vase',
    regex: /\bSV(0?[1-9]|10)\b/i,
    getPrice: () => ({ price: 'Inquire', status: 'inquire' }),
  },


  {
    friendlyName: 'Spline Mug',
    regex: /\bSM(\d+)/i,
    getPrice: () => ({ price: '$40', pairPrice: '$70' }),
  },
  {
    friendlyName: 'Summer Vase',
    regex: /\bSV(1[1-9]|[2-9]\d|\d{3,})/i,
    getPrice: () => ({ price: '$120' }),
  },
  {
    friendlyName: 'Tall Tumbler',
    regex: /\bTA(\d+)/i,
    getPrice: () => ({ price: '$40', pairPrice: '$70' }),
  },
  {
    friendlyName: 'Tumbler',
    regex: /\bTU(\d+)/i,
    getPrice: () => ({ price: '$40', pairPrice: '$70' }),
  },
  {
    friendlyName: 'Martini Tumbler',
    regex: /\bTM(\d+)/i,
    getPrice: () => ({ price: '$40', pairPrice: '$70' }),
  },
  {
    friendlyName: 'Random Vase',
    regex: /\bRV(\d+)/i,
    getPrice: () => ({ price: '$120' }),
  },
];

// Helper function to extract title and pricing from filename
function extractItemInfo(filename: string): { title: string; price: string; status?: 'sold' | 'inquire' | 'not-priced'; pairPrice?: string } {
  const upperName = filename.toUpperCase();
  
  // Ignore items
  if (/\bSPIN\b/i.test(upperName) || /\bHANDHELD\b/i.test(upperName)) {
    return { title: '', price: '', status: 'not-priced' };
  }
  
  // Try to match against product dictionary
  for (const product of PRODUCTS) {
    const match = upperName.match(product.regex);
    if (match) {
      const id = parseInt(match[1], 10);
      const pricingInfo = product.getPrice(id);
      return {
        title: `${product.friendlyName} ${id.toString().padStart(2, '0')}`,
        ...pricingInfo,
      };
    }
  }
  
  // All others - not priced (extract basic title from filename)
  let name = filename.replace(FOLDER_PREFIX, '').replace(/\.[^/.]+$/, '');
  name = name.replace(/[_-]/g, ' ');
  name = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  return { title: name, price: 'Not Priced', status: 'not-priced' };
}

// Helper function to check if item should be included
function shouldIncludeItem(filename: string): boolean {
  const upperName = filename.toUpperCase();
  // Only exclude SPIN and HANDHELD items
  return !(/\bSPIN\b/i.test(upperName) || /\bHANDHELD\b/i.test(upperName));
}

export const GET: APIRoute = async () => {
  try {
    // Query Google Cloud Storage API
    const url = `${BUCKET_API_URL}?prefix=${encodeURIComponent(FOLDER_PREFIX)}&delimiter=/`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from GCS: ${response.statusText}`);
    }
    
    const data: GCSResponse = await response.json();
    
    // Filter to only image files and process them
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.JPG', '.JPEG', '.PNG', '.GIF', '.WEBP'];
    
    // Regex pattern: 2-3 letters, 2-3 numbers, then filename extension
    const filenamePattern = /^[A-Za-z]{2,3}\d{2,3}\.[a-zA-Z]+$/;
    
    const shopItems = (data.items || [])
      .filter(item => {
        // Extract just the filename (without folder path)
        const filename = item.name.split('/').pop() || item.name;
        
        // Filter by filename pattern: 2-3 letters, 2-3 numbers, then extension
        if (!filenamePattern.test(filename)) {
          return false;
        }
        
        const name = item.name.toLowerCase();
        // Filter to only image files
        if (!imageExtensions.some(ext => name.endsWith(ext))) {
          return false;
        }
        // Filter out items that should be ignored
        return shouldIncludeItem(item.name);
      })
      .map(item => {
        const imageUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${item.name}`;
        const itemInfo = extractItemInfo(item.name);
        
        return {
          id: item.name,
          filename: item.name.split('/').pop() || item.name,
          imageUrl,
          title: itemInfo.title,
          price: itemInfo.price,
          status: itemInfo.status,
          pairPrice: itemInfo.pairPrice,
          contentType: item.contentType || 'image/jpeg',
        };
      })
      .sort((a, b) => {
        // Not-priced items go to the end
        const aNotPriced = a.status === 'not-priced';
        const bNotPriced = b.status === 'not-priced';
        
        if (aNotPriced && !bNotPriced) return 1; // a goes after b
        if (!aNotPriced && bNotPriced) return -1; // a goes before b
        // Both have same pricing status, sort alphabetically
        return a.title.localeCompare(b.title);
      });
    
    return new Response(JSON.stringify({ items: shopItems }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error fetching shop items:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch shop items', details: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};

