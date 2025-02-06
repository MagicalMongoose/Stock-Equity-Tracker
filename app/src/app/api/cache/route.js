import { promises as fs } from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'src', 'cache.json');

export async function GET() {
    print("GET API")
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf-8');
        return new Response(data, { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({}), { status: 200 }); // Return empty object if no cache exists
    }
    
}

export async function POST(req) {
    print("POST API")
    try {
        const newCache = await req.json();
        await fs.writeFile(CACHE_FILE, JSON.stringify(newCache, null, 2));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }
}