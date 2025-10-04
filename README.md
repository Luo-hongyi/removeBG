# Image Background Removal Tool

This is a web application based on **Express.js** and **@imgly/background-removal-node**, allowing users to upload images and automatically remove their backgrounds.

## Features

- Simple and easy-to-use web interface  
- Supports multiple image formats (JPG, PNG, GIF, etc.)  
- High-quality background removal using **@imgly/background-removal-node**  
- Supports preview and download of processed images  

## Installation

1. Make sure **Node.js** is installed (recommended version: v14.0.0 or higher)

2. Clone this repository or download the source code

3. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your browser and visit:
```
http://localhost:3333
```

3. Upload an image through the interface — the system will automatically process and display the result.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript  
- **Backend:** Node.js, Express.js  
- **Image Processing:** @imgly/background-removal-node  
- **File Upload:** multer  
- **Logging System:** Winston  

## Project Structure

```
.
├── server.js         # Entry file for the Express server
├── package.json      # Project configuration and dependencies
├── public/           # Static assets directory
│   ├── index.html    # Frontend page
│   └── processed/    # Directory for processed images
├── uploads/          # Temporary storage for uploaded images
└── app.log           # Application log file (configurable)
```

## Configuration

The project uses a **.env** file for configuration, supporting the following parameters:

```
URL=Server access address
LOCAL_PORT=Server listening port
LOG_LEVEL=Log level (debug, info, warn, error)
LOG_FILE=Path to the log file
```

## Logging System

The project uses **Winston** as its logging library, providing the following features:

- Supports multiple log levels (debug, info, warn, error)  
- Outputs to both console and file (configurable)  
- Structured logs with timestamps and metadata  
- Enhanced error stack tracing  
- Adjustable log verbosity via the LOG_LEVEL environment variable  

## Notes

- Background removal may take some time, especially for large images.  
- This application is designed for local use only.  
  For production deployment, consider implementing proper security measures.  

## License

**ISC**
