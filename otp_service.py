otp_store = {}

def send_otp(email):
    otp = "123456"  # simulate
    otp_store[email] = otp
    return {"message": "OTP sent", "otp": otp}

def verify_otp(email, otp):
    return otp_store.get(email) == otp