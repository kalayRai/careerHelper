import { prepareInstructions } from '../../constants';
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router';
import FileUploader from '~/components/FileUploader';
import Navbar from '~/components/Navbar'
import { convertPdfToImage } from '~/lib/pdf2img';
import { usePuterStore } from '~/lib/puter';
import { generateUUID } from '~/lib/utils';

const upload = () => {
    const { auth, isLoading, fs, ai, kv } = usePuterStore();
    const navigate = useNavigate();
    const [ isProcessing, setIsProcessing] = useState(false);
    const [ statusText, setStatusText] = useState('');
    const [ file, setFile] = useState<File | null>(null);

    const handleFileSelect = (file:File | null) => {
        setFile(file)
    }

    const handleAnalyze = async ({
  companyName, 
  jobTitle, 
  jobDescription, 
  file
}: { 
  companyName: string; 
  jobTitle: string; 
  jobDescription: string; 
  file: File;
}) => {
  setIsProcessing(true);

  try {
    setStatusText('Uploading the file...');
    const uploadedFile = await fs.upload([file]);

    if (!uploadedFile) {
      setStatusText('Error: failed to upload the file');
      return;
    }

    setStatusText('Converting to image...');
    const imageFile = await convertPdfToImage(file);

    if (!imageFile.file) {
      setStatusText('Error: failed to convert pdf to image');
      return;
    }

    setStatusText('Uploading the image...');
    const uploadedImage = await fs.upload([imageFile.file]);

    if (!uploadedImage) {
      setStatusText('Error: failed to upload the image');
      return;
    }

    setStatusText('Preparing data...');
    const uuid = generateUUID();

    const data = {
      id: uuid,
      resumePath: uploadedFile.path,
      imagePath: uploadedImage.path,
      companyName,
      jobTitle,
      jobDescription,
      feedback: null
    };

    await kv.set(`resume:${uuid}`, JSON.stringify(data));

    setStatusText('Analyzing...');
    
    // Get feedback from AI
    const feedback = await ai.feedback(
      uploadedFile.path,
      prepareInstructions({ jobTitle, jobDescription })
    );

    // Check if feedback exists and has the expected structure
    if (!feedback) {
      setStatusText('Error: failed to analyze the resume - no response from AI');
      return;
    }

    // Handle different response formats
    let feedbackText = '';
    
    if (typeof feedback.message?.content === 'string') {
      feedbackText = feedback.message.content;
    } else if (feedback.message?.content?.[0]?.text) {
      feedbackText = feedback.message.content[0].text;
    } else if (typeof feedback === 'string') {
      feedbackText = feedback;
    } else {
      console.error('Unexpected feedback format:', feedback);
      setStatusText('Error: Unexpected response format from AI');
      return;
    }

    console.log('Raw feedback text:', feedbackText);

    // Try to parse the feedback as JSON with error handling
    let parsedFeedback;
    try {
      // Check if the response starts with "I'm sorry" or similar error messages
      if (feedbackText.toLowerCase().includes("i'm sorry") || 
          feedbackText.toLowerCase().includes("error") ||
          feedbackText.toLowerCase().includes("cannot")) {
        throw new Error(`AI Error: ${feedbackText.substring(0, 200)}`);
      }
      
      parsedFeedback = JSON.parse(feedbackText);
    } catch (parseError) {
      console.error('Failed to parse feedback as JSON:', parseError);
      console.error('Raw feedback:', feedbackText);
      
      // Store the error message as feedback instead of failing completely
      parsedFeedback = {
        error: true,
        message: `Failed to parse AI response: ${feedbackText.substring(0, 500)}`,
        rawResponse: feedbackText
      };
      
      setStatusText('Warning: AI response was not in expected format, but data was saved');
    }

    // Update data with feedback
    data.feedback = parsedFeedback;
    await kv.set(`resume:${uuid}`, JSON.stringify(data));

    setStatusText('Analysis complete, redirecting...');
    console.log('Saved data:', data);
    //navigate(`/resume/${uuid}`);
    
    // Redirect after successful save
    // router.push(`/results/${uuid}`); // Uncomment when you have routing
    
  } catch (error) {
    console.error('Error in handleAnalyze:', error);
    setStatusText(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
  } finally {
    setIsProcessing(false);
  }
};

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget.closest('form');
        if(!form) return;
        const formData = new FormData(form);

        const companyName = formData.get('company-name') as string;
        const jobTitle = formData.get('job-title') as string;
        const jobDescription = formData.get('job-description') as string;

        if(!file) return;

        handleAnalyze({companyName, jobTitle, jobDescription, file});
    }

  return (
    <main className="bg-[url('/images/bg-main.svg')] bg-cover">
        <Navbar />

        <section className='main-section'>
            <div className='page-heading py-16'>
                <h1>Smart feedbacks for your dream job</h1>
                {isProcessing ? (
                    <>
                        <h2>{statusText}</h2>
                        <img src="/images/resume-scan.gif" className='w-full' alt="" />
                    </>
                ) : (
                    <h2>Drop your resume for an ATS score and improvement tips</h2>
                )}
                {!isProcessing && (
                    <form id='uplaod-form' onSubmit={handleSubmit} className='flex flex-col gap-4 mt-8'>
                        <div className='form-div'>
                            <label htmlFor="company-name">Company Name</label>
                            <input type="text" name='company-name' placeholder='comapny name' id='company-name' />
                        </div>
                        <div className='form-div'>
                            <label htmlFor="job-title">Job Title</label>
                            <input type="text" name='job-title' placeholder='job title' id='Job-title' />
                        </div>
                        <div className='form-div'>
                            <label htmlFor="job-description">Job Description</label>
                            <textarea rows={5} name='job-description' placeholder='job-description' id='job-description' />
                        </div>
                        <div className='form-div'>
                            <label htmlFor="uploader">Upload Resume</label>
                            <FileUploader onFileSelect={handleFileSelect} />
                        </div>

                        <button className='primary-button' type='submit'>
                            Analyze Resume
                        </button>
                    </form>
                )}
            </div>
        </section>
    </main>
  )
}

export default upload