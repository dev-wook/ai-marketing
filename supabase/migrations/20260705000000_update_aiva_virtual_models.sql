update public.ai_image_design_models
set
  description = case code
    when 'model-a' then '긴 흑발과 차분한 눈매가 돋보이는 청순하고 우아한 이미지'
    when 'model-b' then '브라운 단발과 밝은 미소가 돋보이는 사랑스럽고 귀여운 이미지'
    when 'model-c' then '긴 웨이브 헤어와 맑은 인상이 돋보이는 청량하고 세련된 이미지'
    else description
  end,
  thumbnail_path = case code
    when 'model-a' then '/ai-image-generation/aiva-model-a.png'
    when 'model-b' then '/ai-image-generation/aiva-model-b.png'
    when 'model-c' then '/ai-image-generation/aiva-model-c.png'
    else thumbnail_path
  end,
  version = case
    when code in ('model-a', 'model-b', 'model-c') then version + 1
    else version
  end,
  updated_at = now()
where code in ('model-a', 'model-b', 'model-c');
