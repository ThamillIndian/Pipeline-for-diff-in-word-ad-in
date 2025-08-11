// Debug script to test the comparison logic with your actual JSON data

// Sample data from your JSON
const testCases = [
  {
    paragraph: 10,
    input_with_markers: "People from Morocco in the Netherlands are generally referred to as Moroccans or Moroccan Dutch etc. However, people from Morocco may prefer to be referred to in other ways. For instance, people from the Berber<[sup]><[/sup]> minority may choose to be referred to as Amazigh or Moroccan Berber. Throughout the chapter, we will use Moroccan to refer to people originating from Morocco's geographical area and only make ethnic distinctions when relevant.",
    latest_edited_text: "<{body_text}> People from Morocco in the Netherlands are generally referred to as Moroccans or Moroccan Dutch, etc. However, people from Morocco may prefer to be referred to in other ways. For instance, people from the Berber<[sup]><[/sup]> minority may choose to be referred to as Amazigh or Moroccan Berber. Throughout the chapter, we will use Moroccan to refer to people originating from Morocco's geographical area and only make ethnic distinctions when relevant."
  },
  {
    paragraph: 11,
    input_with_markers: "Merkel's cells demonstrated an unusual response to Valium (diazepam), especially in white subjects compared to black subjects who recieved apples, pears and oranges. The Wassermann's test was also administered, alongside a Foley's catheter check. This phenomena is extremely important for understanding the disease's progression. Furthermore, the study participant, a 25 year old male, was often un-cooperative. In 1950 Doctor Smith first noted these observations.",
    latest_edited_text: "<{body_text}> Merkel cells demonstrated an unusual response to diazepam (Valium), especially in White subjects compared with Black subjects who received apples, pears, and oranges. The Wassermann test was also administered, alongside a Foley catheter check. This phenomenon is extremely important for understanding the disease's progression. Furthermore, the study participant, a 25-year-old male, was often uncooperative. In 1950 Doctor Smith first noted these observations."
  },
  {
    paragraph: 15,
    input_with_markers: "Subsequently E. Coli, a common bacteria, behaved erratically in these individuals; there tests indicated that between 10% - fifteen percent experienced this unique reaction. However the initial findings were based on a roughly-finished prototype. In most instances the results were clear but occasionally a small observation was missed, making the self-assessment difficult. The results for the group who were well-fed and -rested were better. For example the team found that 3 + 5 = 9. This will require re-examination.",
    latest_edited_text: "<{body_text}> Subsequently, <[i]>E. coli<[/i]>, a common bacteria, behaved erratically in these individuals; their tests indicated that between 10% and 15% experienced this unique reaction. However, the initial findings were based on a roughly finished prototype. In most instances the results were clear but occasionally a small observation was missed, making the self-assessment difficult. The results for the group who were well fed and well rested were better. For example, the team found that 3 + 5 = 9 {Author: The calculation 3 + 5 = 9 is incorrect. Please verify the intended numbers.}. This will require reexamination."
  }
];

// Simulate the removeMarkupTags function
function removeMarkupTags(text) {
  if (!text) return '';
  
  // Remove all markup tags like <{tag}>, <[tag]>, <[/tag]>
  return text
    .replace(/<\{[^}]*\}>/g, '')  // Remove <{tag}> style tags
    .replace(/<\[[^\]]*\]>/g, '') // Remove <[tag]> and <[/tag]> style tags
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .trim();
}

console.log('=== DEBUGGING COMPARISON LOGIC ===\n');

testCases.forEach(testCase => {
  console.log(`--- Paragraph ${testCase.paragraph} ---`);
  
  const originalText = removeMarkupTags(testCase.input_with_markers);
  const correctedText = removeMarkupTags(testCase.latest_edited_text);
  
  console.log(`Raw input_with_markers: "${testCase.input_with_markers.substring(0, 100)}..."`);
  console.log(`Raw latest_edited_text: "${testCase.latest_edited_text.substring(0, 100)}..."`);
  console.log(`Cleaned Original: "${originalText.substring(0, 100)}..."`);
  console.log(`Cleaned Corrected: "${correctedText.substring(0, 100)}..."`);
  console.log(`Are they equal? ${originalText === correctedText}`);
  console.log(`Original length: ${originalText.length}, Corrected length: ${correctedText.length}`);
  
  if (originalText !== correctedText) {
    console.log('✅ DIFFERENCES DETECTED - This should create corrections!');
    
    // Show first difference
    for (let i = 0; i < Math.min(originalText.length, correctedText.length); i++) {
      if (originalText[i] !== correctedText[i]) {
        console.log(`First difference at position ${i}:`);
        console.log(`Original: "${originalText.substring(i-10, i+10)}" (char: "${originalText[i]}")`);
        console.log(`Corrected: "${correctedText.substring(i-10, i+10)}" (char: "${correctedText[i]}")`);
        break;
      }
    }
  } else {
    console.log('❌ NO DIFFERENCES - This is the problem!');
  }
  
  console.log('\n');
});
