export class MyAgent extends Agent {
  async browse(browserInstance, urls) {
    let responses = [];
    for (const url of urls) {
      const browser = await puppeteer.launch(browserInstance);
      const page = await browser.newPage();
      await page.goto(url);

      await page.waitForSelector("body");
      const bodyContent = await page.$eval(
        "body",
        (element) => element.innerHTML,
      );
      const client = new OpenAI({
        apiKey: this.env.OPENAI_API_KEY,
      });

      let resp = await client.chat.completions.create({
        model: this.env.MODEL,
        messages: [
          {
            role: "user",
            content: `Return a JSON object with the product names, prices and URLs with the following format: { "name": "Product Name", "price": "Price", "url": "URL" } from the website content below. <content>${bodyContent}</content>`,
          },
        ],
        response_format: {
          type: "json_object",
        },
      });

      responses.push(resp);
      await browser.close();
    }

    return responses;
  }
}