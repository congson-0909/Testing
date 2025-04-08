const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    version: process.env.npm_package_version,
    memory: process.memoryUsage()
  });
});

// Screenshot API
app.post('/screenshot', async (req, res) => {
  const startTime = Date.now();
  let browser;
  
  try {
    const { url, fullPage = true, delay = 0, quality = 80 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Launch browser with optimized settings for Render
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser' || '/usr/bin/chromium'
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Configure timeout and navigation
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // Optional delay before screenshot
    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    // Take screenshot
    const screenshotOptions = { 
      fullPage: fullPage,
      ...(url.endsWith('.jpg') && { 
        type: 'jpeg',
        quality: Math.min(Math.max(quality, 0), 100)
      })
    };

    const screenshot = await page.screenshot(screenshotOptions);
    
    // Close browser immediately after use
    await browser.close();

    // Send response
    res.set({
      'Content-Type': `image/${screenshotOptions.type || 'png'}`,
      'X-Processing-Time': `${Date.now() - startTime}ms`,
      'X-Puppeteer-Version': await browser.version()
    });
    res.send(screenshot);

  } catch (error) {
    console.error('Screenshot error:', error);
    
    // Ensure browser is closed even if error occurs
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Browser close error:', e);
      }
    }

    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Unexpected server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Puppeteer executable path: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'bundled'}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason.stack || reason);
});