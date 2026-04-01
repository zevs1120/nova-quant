# This directory holds pre-trained model files (.pkl, .pickle, .joblib).

# Models are trained locally (Mac/Colab) and deployed to EC2.

#

# Example workflow:

# 1. Train on Mac: python scripts/train_lightgbm.py

# 2. Output: models/lightgbm_alpha158.pkl

# 3. Deploy: scp models/\*.pkl ec2:/opt/nova-quant/qlib-bridge/models/

#

# Model files are git-ignored due to size.
