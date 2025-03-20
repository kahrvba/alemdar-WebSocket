import express from 'express';
import { WebSocketServer } from 'ws';
import { SerialPort } from 'serialport';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());

// Create HTTP server
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store connected clients and serial port
const clients = new Set();
let serialPort = null;

// Handle WebSocket connections
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'connect':
          if (serialPort) {
            serialPort.close();
          }
          
          serialPort = new SerialPort({
            path: data.port,
            baudRate: 9600,
            autoOpen: false
          });

          serialPort.open((err) => {
            if (err) {
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Failed to open port' 
              }));
              return;
            }

            ws.send(JSON.stringify({ type: 'connected' }));
          });

          serialPort.on('data', (data) => {
            const message = JSON.stringify({
              type: 'arduino-data',
              data: data.toString()
            });
            
            clients.forEach(client => {
              if (client.readyState === ws.OPEN) {
                client.send(message);
              }
            });
          });
          break;

        case 'command':
          if (serialPort?.isOpen) {
            serialPort.write(data.command, (err) => {
              if (err) {
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'Failed to send command' 
                }));
              }
            });
          }
          break;
      }
    } catch (error) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error.message 
      }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });
});

app.get('/health', (_, res) => {
  res.json({ status: 'healthy' });
});