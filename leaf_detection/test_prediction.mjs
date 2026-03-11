import { Client, handle_file } from "@gradio/client";
import * as fs from "fs";

async function run() {
    try {
        console.log("Connecting...");
        const client = await Client.connect("moazx/plant-leaf-diseases-detection-using-cnn");
        
        console.log("Predicting...");
        // Use a dummy image from the internet
        const fetchFile = await fetch("https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Tomato_leaf.jpg/800px-Tomato_leaf.jpg");
        const blob = await fetchFile.blob();
        
        const result = await client.predict("/predict", [
            blob
        ]);
        
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error(err);
    }
}

run();
