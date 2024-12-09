const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

// Cosmos DB configuration
const endpoint = process.env.COSMOS_DB_ENDPOINT; // Your Cosmos DB endpoint
const key = process.env.COSMOS_DB_KEY; // Your Cosmos DB primary key
const databaseId = "websiteData"; // Your actual Cosmos DB database name
const containerId = "websiteData"; // Your actual container name
const client = new CosmosClient({ endpoint, key });

// Blob Storage configuration
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.BLOB_STORAGE_CONNECTION_STRING);

module.exports = async function (context, req) {
    const container = client.database(databaseId).container(containerId);

    // Set CORS headers
    context.res = {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://nice-field-0178e0003.4.azurestaticapps.net",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
        },
        body: token.url,
      };

    if (req.method === "OPTIONS") {
        // Handle CORS preflight request
        context.res.status = 204;
        return;
    }

    if (req.method === "DELETE") {
        const videoId = req.query.id; // Get video ID from query string

        context.log(`Received request to delete video with ID: ${videoId}`);

        if (!videoId) {
            context.res = {
                status: 400,
                body: "Video ID is required.",
            };
            return;
        }

        try {
            // Fetch the metadata from Cosmos DB
            context.log(`Querying Cosmos DB with video ID: ${videoId}`);
            const { resource: video } = await container.item(videoId, "video").read();

            if (!video) {
                context.log(`Video with ID: ${videoId} not found in Cosmos DB.`);
                context.res = {
                    status: 404,
                    body: "Video not found.",
                };
                return;
            }

            const filePath = video.filePath; // Extract file path from metadata
            const fileName = video.fileName; // Extract the file name (optional, for logging)
            context.log(`File path from Cosmos DB: ${filePath}`);
            context.log(`File name from Cosmos DB: ${fileName}`);

            const blobContainerName = filePath.split('/')[1]; // Extract the container name
            const blobName = filePath.substring(filePath.indexOf(blobContainerName) + blobContainerName.length + 1);
            context.log(`Blob container name: ${blobContainerName}`);
            context.log(`Blob name: ${blobName}`);

            // Initialize the Blob container client
            const blobContainerClient = blobServiceClient.getContainerClient(blobContainerName);
            const blockBlobClient = blobContainerClient.getBlockBlobClient(blobName);
            context.log(`Blob URL: ${blockBlobClient.url}`);

            // Delete the binary file from Blob Storage
            await blockBlobClient.delete();

            // Log success for Blob deletion
            context.log(`Blob deleted: ${blobName}`);

            // Delete the metadata from Cosmos DB
            await container.item(videoId, "video").delete();

            // Respond with success
            context.res = {
                status: 200,
                body: `Video metadata and file (${fileName}) deleted successfully.`,
            };
        } catch (err) {
            context.log(`Error deleting video with ID: ${videoId}. Error: ${err.message}`);
            context.res = {
                status: 500,
                body: `Error deleting video: ${err.message}`,
            };
        }
    } else if (req.method === "PUT") {
        const videoId = req.query.id;
        const newComment = req.body; // The comment object from the request body

        context.log(`Received request to update video with ID: ${videoId}`);

        if (!videoId) {
            context.res = {
                status: 400,
                body: "Video ID is required.",
            };
            return;
        }

        if (!newComment || !newComment.comment || !newComment.userId || !newComment.userName) {
            context.res = {
                status: 400,
                body: "Invalid comment data.",
            };
            return;
        }

        try {
            // Query Cosmos DB for the video
            const querySpec = {
                query: "SELECT * FROM c WHERE c.id = @id AND c.type = @type",
                parameters: [
                    { name: "@id", value: videoId },
                    { name: "@type", value: "video" },
                ],
            };

            const { resources: items } = await container.items.query(querySpec).fetchAll();
            if (items.length === 0) {
                context.res = {
                    status: 404,
                    body: "Video not found.",
                };
                return;
            }

            const video = items[0];
            video.comments = video.comments || []; // Initialize comments if not already set
            video.comments.push(newComment); // Add the new comment

            // Update the video metadata in Cosmos DB
            await container.item(videoId, videoId).replace(video);

            // Respond with success
            context.res = {
                status: 200,
                body: `Comment added successfully to video with ID: ${videoId}.`
            };
        } catch (err) {
            context.log(`Error updating video with ID: ${videoId}. Error: ${err.message}`);
            context.res = {
                status: 500,
                body: `Error updating video: ${err.message}`
            };
        }
    } else {
        context.res = {
            status: 405,
            body: "Method not allowed."
        };
    }
};
