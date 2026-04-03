import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center">
      <SignUp />
    </div>
  );
}
