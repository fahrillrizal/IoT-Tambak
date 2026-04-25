"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Mail,
  Lock,
  Activity,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";
import { AuthSkeleton } from "@/components/skeletons/AuthSkeleton";

type Step = "email" | "otp" | "password";

const STORAGE_KEY = "forgot_password_state";

interface StoredState {
  step: Step;
  email: string;
  otp: string;
  resendCount: number;
  cooldownEnd: number | null;
}

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCheckingStorage, setIsCheckingStorage] = useState(true);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const state: StoredState = JSON.parse(stored);
        setStep(state.step);
        setEmail(state.email);
        if (state.otp) {
          setOtpDigits(
            state.otp.split("").concat(["", "", "", "", ""]).slice(0, 5)
          );
        }
        setResendCount(state.resendCount);

        if (state.cooldownEnd) {
          const remaining = Math.max(
            0,
            Math.floor((state.cooldownEnd - Date.now()) / 1000)
          );
          setCooldown(remaining);
        }
      } catch (e) {
        console.error("Failed to parse stored state:", e);
      }
    }
    setIsCheckingStorage(false);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const state: StoredState = {
      step,
      email,
      otp: otpDigits.join(""),
      resendCount,
      cooldownEnd: cooldown > 0 ? Date.now() + cooldown * 1000 : null,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [step, email, otpDigits, resendCount, isInitialized]);

  const clearStorage = () => {
    sessionStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);

    const newOtpDigits = [...otpDigits];
    newOtpDigits[index] = digit;
    setOtpDigits(newOtpDigits);

    if (digit && index < 4) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 5);
    if (pastedData) {
      const newOtpDigits = pastedData
        .split("")
        .concat(["", "", "", "", ""])
        .slice(0, 5);
      setOtpDigits(newOtpDigits);

      const lastIndex = Math.min(pastedData.length, 4);
      otpInputRefs.current[lastIndex]?.focus();
    }
  };

  const getOtp = () => otpDigits.join("");

  const handleSendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.remainingSeconds) {
          setCooldown(data.remainingSeconds);
        }
        setError(data.error);
      } else {
        setSuccess(data.message);
        if (data.resendCount !== undefined) {
          setResendCount(data.resendCount);
        }
        if (step === "email") {
          setStep("otp");
          setCooldown(30);
        } else {
          setCooldown(resendCount === 0 ? 30 : 120);
        }
      }
    } catch (err) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    const otp = getOtp();
    if (otp.length !== 5) {
      setError("Kode OTP harus 5 digit");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
      } else {
        setSuccess(data.message);
        setStep("password");
      }
    } catch (err) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("Password minimal 8 karakter");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Password dan konfirmasi password tidak cocok");
      setIsLoading(false);
      return;
    }

    const otp = getOtp();
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
      } else {
        clearStorage();
        setSuccess(
          "Password berhasil direset! Mengalihkan ke halaman login..."
        );
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch (err) {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const getResendButtonText = () => {
    if (cooldown > 0) {
      const minutes = Math.floor(cooldown / 60);
      const seconds = cooldown % 60;
      return `Kirim Ulang (${minutes > 0 ? `${minutes}m ` : ""}${seconds}s)`;
    }
    if (resendCount >= 2) {
      return "Batas pengiriman tercapai";
    }
    return "Kirim Ulang OTP";
  };

  if (isCheckingStorage) {
    return <AuthSkeleton />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-cyan-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-blue-100 p-3">
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {step === "email" && "Lupa Password"}
            {step === "otp" && "Verifikasi OTP"}
            {step === "password" && "Reset Password"}
          </CardTitle>
          <CardDescription>
            {step === "email" && "Masukkan email Anda untuk menerima kode OTP"}
            {step === "otp" && "Masukkan kode OTP yang dikirim ke email Anda"}
            {step === "password" && "Buat password baru untuk akun Anda"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md flex items-center gap-2">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm">{success}</p>
            </div>
          )}

          {/* Step 1: Email Input */}
          {step === "email" && (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nama@example.com"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !email}
              >
                {isLoading ? "Mengirim..." : "Kirim OTP"}
              </Button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === "otp" && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="space-y-3">
                <Label className="text-center block">Kode OTP</Label>
                <div
                  className="flex justify-center gap-2"
                  onPaste={handleOtpPaste}
                >
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpInputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      disabled={isLoading}
                      className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all disabled:bg-gray-100 disabled:cursor-not-allowed"
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
                <p className="text-sm text-gray-500 text-center">
                  OTP dikirim ke: <span className="font-medium">{email}</span>
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || getOtp().length !== 5}
              >
                {isLoading ? "Memverifikasi..." : "Verifikasi OTP"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => handleSendOTP()}
                disabled={isLoading || cooldown > 0 || resendCount >= 2}
              >
                {getResendButtonText()}
              </Button>
            </form>
          )}

          {/* Step 3: New Password */}
          {step === "password" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password Baru</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !password || !confirmPassword}
              >
                {isLoading ? "Menyimpan..." : "Reset Password"}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Link
            href="/login"
            className="text-sm text-blue-600 hover:underline font-medium flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke halaman login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
