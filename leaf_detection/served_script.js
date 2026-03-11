(async () => {
    console.log("Script loaded");
    const { Client, handle_file } = await import("https://cdn.jsdelivr.net/npm/@gradio/client/+esm");

    // Fallback function to call HF Space API directly using Gradio's queue API
    async function callHFSpaceAPI(file) {
        console.log("Attempting direct API call as fallback...");

        const baseURL = "https://moazx-plant-leaf-diseases-detection-using-cnn.hf.space";

        try {
            // Step 1: Convert file to base64
            const fileData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            console.log("File converted to base64");

            // Step 2: Submit request to the queue
            console.log("Submitting to queue endpoint...");
            const submitResponse = await fetch(
                `${baseURL}/api/queue/join`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        data: [fileData],
                        fn_index: 0
                    })
                }
            );

            if (!submitResponse.ok) {
                const errorText = await submitResponse.text();
                console.error("Queue submit failed:", submitResponse.status, errorText);

                // Try alternative endpoint
                console.log("Trying alternative /api/predict endpoint...");
                const altResponse = await fetch(
                    `${baseURL}/api/predict`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            data: [fileData]
                        })
                    }
                );

                if (!altResponse.ok) {
                    throw new Error(`Both endpoints failed. Queue: ${submitResponse.status}, Predict: ${altResponse.status}`);
                }

                const data = await altResponse.json();
                console.log("Alternative API response:", data);
                return data;
            }

            const queueResponse = await submitResponse.json();
            console.log("Queue response:", queueResponse);

            // Step 3: Poll for result
            if (queueResponse?.hash) {
                console.log("Polling for result with hash:", queueResponse.hash);

                let pollCount = 0;
                const maxPolls = 60; // 60 second timeout

                while (pollCount < maxPolls) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

                    const statusResponse = await fetch(
                        `${baseURL}/api/queue/join`,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                hash: queueResponse.hash
                            })
                        }
                    );

                    if (statusResponse.ok) {
                        const status = await statusResponse.json();
                        console.log("Poll status:", status);

                        if (status?.data) {
                            return { data: status.data };
                        }
                    }

                    pollCount++;
                }

                throw new Error("Polling timeout - no result received after 60 seconds");
            }

            // If no hash, return the response directly
            return { data: queueResponse?.data || queueResponse };

        } catch (error) {
            console.error("Direct API call failed:", error);
            throw error;
        }
    }

    const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    const DECISION_CONFIDENCE_THRESHOLD = 0.6; // 60%

    const leafImageInput = document.getElementById("leafImage");
    const leafPreview = document.getElementById("leafPreview");
    const previewPlaceholder = document.getElementById("previewPlaceholder");
    const detectBtn = document.getElementById("detectBtn");
    const statusMessage = document.getElementById("statusMessage");
    const diseaseName = document.getElementById("diseaseName");
    const confidenceScore = document.getElementById("confidenceScore");
    const diseaseStatus = document.getElementById("diseaseStatus");
    const allProbabilities = document.getElementById("allProbabilities");

    let selectedLeafFile = null;

    leafImageInput.addEventListener("change", (event) => {
        console.log("Change event fired");
        selectedLeafFile = event.target.files[0];

        if (!selectedLeafFile) return;

        // File size validation
        if (selectedLeafFile.size > MAX_FILE_SIZE_BYTES) {
            statusMessage.textContent = `File is too large. Maximum allowed size is ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`;
            selectedLeafFile = null;
            leafPreview.src = "";
            leafPreview.style.display = "none";
            previewPlaceholder.style.display = "flex";
            return;
        }

        const imageUrl = URL.createObjectURL(selectedLeafFile);
        leafPreview.src = imageUrl;
        leafPreview.style.display = "block";
        previewPlaceholder.style.display = "none";

        diseaseName.textContent = "No result yet";
        confidenceScore.textContent = "-";
        allProbabilities.innerHTML = "";
        statusMessage.textContent = "";
    });

    function setProcessing(isProcessing) {
        detectBtn.disabled = isProcessing;
        if (isProcessing) {
            detectBtn.textContent = "Analyzing...";
            detectBtn.setAttribute('aria-busy', 'true');
        } else {
            detectBtn.textContent = "Detect Disease";
            detectBtn.removeAttribute('aria-busy');
        }
    }


    detectBtn.addEventListener("click", async () => {
        if (!selectedLeafFile) {
            statusMessage.textContent = "Please upload a leaf image first.";
            return;
        }

        console.log("Starting detection...");
        console.log("Selected file:", selectedLeafFile.name, selectedLeafFile.size, "bytes");

        statusMessage.textContent = "Connecting to Hugging Face Space...";
        diseaseName.textContent = "Processing...";
        confidenceScore.textContent = "-";
        allProbabilities.innerHTML = "";

        setProcessing(true);

        try {
            console.log("Attempting to connect to Hugging Face Space...");
            let result;
            let useGradio = true;

            try {
                const client = await Client.connect("moazx/plant-leaf-diseases-detection-using-cnn");
                console.log("Successfully connected to Hugging Face Space");

                statusMessage.textContent = "Analyzing image...";

                result = await client.predict("/predict", [
                    await handle_file(selectedLeafFile)
                ]);
            } catch (clientError) {
                console.warn("Gradio client failed, trying direct API call...", clientError);
                statusMessage.textContent = "Retrying with alternative method...";
                useGradio = false;
                result = await callHFSpaceAPI(selectedLeafFile);
            }

            console.log("HF result:", result);
            console.log("Result type:", typeof result);
            console.log("Result keys:", Object.keys(result || {}));

            // Handle different possible response formats from Gradio
            // Gradio can return: result.data, result, or wrapped in other structures
            let rawOutput = null;

            if (result?.data !== undefined) {
                // Standard Gradio response format with .data property
                if (Array.isArray(result.data)) {
                    rawOutput = result.data[0];
                    console.log("Extracted from result.data[0]:", rawOutput);
                } else {
                    rawOutput = result.data;
                    console.log("Extracted from result.data:", rawOutput);
                }
            } else if (Array.isArray(result)) {
                // Response is directly an array
                rawOutput = result[0];
                console.log("Response is array, extracted first item:", rawOutput);
            } else {
                // Response is the data itself
                rawOutput = result;
                console.log("Using response directly as data:", rawOutput);
            }

            let parsedPredictions = [];

            // Parse predictions based on the format
            if (Array.isArray(rawOutput)) {
                // Already an array of predictions
                parsedPredictions = rawOutput;
                console.log("Data is already a parsed predictions array");
            } else if (typeof rawOutput === "string") {
                // Try to parse as JSON
                try {
                    const parsed = JSON.parse(rawOutput);
                    if (Array.isArray(parsed)) {
                        parsedPredictions = parsed;
                    } else if (parsed?.data && Array.isArray(parsed.data)) {
                        parsedPredictions = parsed.data;
                    } else {
                        parsedPredictions = [parsed];
                    }
                    console.log("Parsed string JSON successfully:", parsedPredictions);
                } catch {
                    // If it's a plain string (like disease name), treat it as a result
                    console.log("String is not JSON, treating as plain text result:", rawOutput);
                    diseaseName.textContent = rawOutput;
                    confidenceScore.textContent = "N/A";
                    statusMessage.textContent = "Prediction completed.";
                    setProcessing(false);
                    return;
                }
            } else if (typeof rawOutput === "object" && rawOutput !== null) {
                // It's an object, check if it has prediction info
                if (Array.isArray(rawOutput.confidences)) {
                    // Gradio Label component response: { label: '...', confidences: [{label: '...', confidence: 0.99}] }
                    parsedPredictions = rawOutput.confidences.map(c => ({
                        label: c.label,
                        score: c.confidence !== undefined ? c.confidence : (c.score || 0)
                    }));
                    console.log("Extracted confidences from object");
                } else if (rawOutput.label !== undefined || rawOutput.score !== undefined) {
                    parsedPredictions = [rawOutput];
                    console.log("Wrapped object as single prediction");
                } else if (rawOutput.predictions !== undefined) {
                    parsedPredictions = rawOutput.predictions;
                    console.log("Extracted predictions from object");
                } else {
                    console.log("Unknown object structure:", rawOutput);
                    diseaseName.textContent = "Unexpected output";
                    confidenceScore.textContent = "N/A";
                    statusMessage.textContent = "Prediction completed, but response format was unusual.";
                    setProcessing(false);
                    return;
                }
            } else {
                console.log("Unknown output format type:", typeof rawOutput, rawOutput);
                diseaseName.textContent = "Unexpected output";
                confidenceScore.textContent = "N/A";
                statusMessage.textContent = "Prediction completed, but response format was unusual.";
                setProcessing(false);
                return;
            }

            if (!parsedPredictions || parsedPredictions.length === 0) {
                diseaseName.textContent = "No prediction returned";
                confidenceScore.textContent = "N/A";
                statusMessage.textContent = "No prediction found.";
                setProcessing(false);
                return;
            }

            const topPrediction = parsedPredictions[0];
            const topLabel = formatLabel(topPrediction.label || "Unknown");
            const topConfidence = ((topPrediction.score || 0) * 100).toFixed(2) + "%";

            diseaseName.textContent = topLabel;
            confidenceScore.textContent = topConfidence;
            statusMessage.textContent = "Prediction completed successfully.";

            diseaseStatus.textContent = decideDiseaseStatus(topPrediction.label, topPrediction.score);

            displayProbabilities(parsedPredictions);

        } catch (error) {
            console.error("API call error:", error);
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);

            let errorMsg = error.message || String(error);

            // Provide more helpful error messages
            if (errorMsg.includes("HTTP 500")) {
                errorMsg = "Server error (500): The Hugging Face Space may be temporarily unavailable or experiencing issues. Please try again in a few moments.";
            } else if (errorMsg.includes("metadata could not be loaded")) {
                errorMsg = "Space metadata could not be loaded. This may be a temporary issue with Hugging Face. Please try again in a moment.";
            } else if (errorMsg.includes("Network")) {
                errorMsg = "Network error: Please check your internet connection.";
            } else if (errorMsg.includes("CORS")) {
                errorMsg = "CORS error: The API server doesn't allow requests from this origin.";
            } else if (errorMsg.includes("401") || errorMsg.includes("403")) {
                errorMsg = "Authentication error: Invalid API credentials or space name.";
            } else if (errorMsg.includes("404")) {
                errorMsg = "Not found error: The API endpoint may not exist or the Space name is incorrect.";
            }

            statusMessage.textContent = `Failed to call the Hugging Face API: ${errorMsg}`;
            diseaseName.textContent = "Error";
            confidenceScore.textContent = "N/A";
            allProbabilities.innerHTML = `<p class="error-text">${escapeHtml(errorMsg)}</p>`;

            // Suggestion for debugging
            console.log("Try the following to debug:");
            console.log("1. Check if the HF Space is publicly accessible at: https://huggingface.co/spaces/moazx/plant-leaf-diseases-detection-using-cnn");
            console.log("2. Verify the space is running and not in a 'sleep' state");
            console.log("3. Check your internet connection");
            console.log("4. Try again in a few moments if the server is temporarily down");
            console.log("5. Check the browser console (F12) for detailed error information");
        } finally {
            setProcessing(false);
        }
    });

    function formatLabel(label) {
        return String(label)
            .replace(/_/g, " ")
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    function decideDiseaseStatus(label, score) {
        if (label == null) return 'Uncertain';
        const l = String(label).toLowerCase();
        const isHealthyLabel = l.includes('healthy') || l.includes('normal');

        if (isHealthyLabel) {
            if (score >= DECISION_CONFIDENCE_THRESHOLD) return 'Healthy';
            return 'Uncertain';
        }

        // Label not explicitly healthy
        if (score >= DECISION_CONFIDENCE_THRESHOLD) return 'Diseased';

        return 'Uncertain';
    }

    function displayProbabilities(predictions) {
        allProbabilities.innerHTML = "";

        predictions.forEach((prediction) => {
            const label = formatLabel(prediction.label || "Unknown");
            const score = (prediction.score || 0) * 100;

            const wrapper = document.createElement("div");
            wrapper.className = "probability-item";

            wrapper.innerHTML = `
                <div class="probability-header">
                    <span>${escapeHtml(label)}</span>
                    <span>${score.toFixed(2)}%</span>
                </div>
                <div class="probability-bar">
                    <div class="probability-fill" style="width: ${score}%"></div>
                </div>
            `;

            allProbabilities.appendChild(wrapper);
        });
    }

    // Small helper to avoid injecting raw error messages or labels
    function escapeHtml(unsafe) {
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
})();
