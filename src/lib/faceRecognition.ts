import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

let isLoaded = false;

export async function loadFaceApiModels() {
  if (isLoaded) return;
  
  try {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    isLoaded = true;
    console.log('Face API models loaded successfully');
  } catch (err) {
    console.error('Error loading Face API models:', err);
  }
}

export async function getFaceEmbedding(input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): Promise<number[] | null> {
  if (!isLoaded) await loadFaceApiModels();
  
  const detection = await faceapi.detectSingleFace(input)
    .withFaceLandmarks()
    .withFaceDescriptor();
    
  if (!detection) return null;
  
  return Array.from(detection.descriptor);
}

export function calculateFaceSimilarity(embedding1: number[], embedding2: number[]): number {
  // face-api.js uses Euclidean distance for descriptors
  // A distance < 0.6 is usually considered a match
  let distance = 0;
  for (let i = 0; i < embedding1.length; i++) {
    distance += Math.pow(embedding1[i] - embedding2[i], 2);
  }
  return Math.sqrt(distance);
}

export async function detectFaces(input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement) {
  if (!isLoaded) await loadFaceApiModels();
  return await faceapi.detectAllFaces(input).withFaceLandmarks().withFaceDescriptors();
}
