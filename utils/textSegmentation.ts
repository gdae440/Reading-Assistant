export const splitTextIntoSentences = (text: string): string[] => {
  return text.match(/[^.!?。！？\n\r]+[.!?。！？\n\r]*|[\n\r]+/g) || [text];
};

export const splitBrowserSpeechSegments = (text: string): string[] => {
  const result: string[] = [];
  const sentences = splitTextIntoSentences(text).map(sentence => sentence.trim()).filter(Boolean);

  for (const sentence of sentences) {
    if (sentence.length <= 180) {
      result.push(sentence);
      continue;
    }

    for (let index = 0; index < sentence.length; index += 160) {
      result.push(sentence.slice(index, index + 160));
    }
  }

  return result.length > 0 ? result : [text];
};
