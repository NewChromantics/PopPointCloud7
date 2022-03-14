#version 300 es
precision highp float;
in vec2 FragColourUv;
out vec4 OutFragColor;

uniform sampler2D ColourImage;

void main()
{
	OutFragColor = texture(ColourImage,FragColourUv);
	OutFragColor.xy =FragColourUv;
}

